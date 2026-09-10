import {
  Inject,
  Injectable,
  Logger,
  Optional
} from "@nestjs/common";
import { ReviewDecision, ReviewStatus } from "@prisma/client";
import { Worker, type Job, type Processor } from "bullmq";
import { PrismaService } from "../../prisma/prisma.service";
import {
  getReviewQueueConnection,
  isReviewQueueConfigured,
  REVIEW_QUEUE_NAME,
  type ReviewQueuePayload
} from "./review.queue";
import { chat, isArkConfigured } from "../memory/llm/ark-adapter";
import { MemoryService } from "../memory/memory.service";
import {
  SopEngineService,
  type SopInput
} from "../memory/teaching-agents/sop-engine.service";
import { AgentAvatarService } from "../memory/agent-avatar/agent-avatar.service";
import { AgentWorldService } from "../realtime/agent-world.service";
import { RealtimeGateway } from "../realtime/realtime.gateway";

const reviewLogger = new Logger("ReviewProcessor");

export type ReviewProcessorResult = {
  submissionId: string;
  status: ReviewStatus;
  suggestedScore: number | null;
  finalScore: number | null;
  decision: ReviewDecision | null;
  rationale: string;
};

@Injectable()
export class ReviewProcessingService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Optional() @Inject(SopEngineService)
    private readonly sopEngine?: SopEngineService,
    @Optional() @Inject(MemoryService)
    private readonly memoryService?: MemoryService,
    @Optional() @Inject(AgentAvatarService)
    private readonly avatarService?: AgentAvatarService,
    @Optional() @Inject(AgentWorldService)
    private readonly agentWorld?: AgentWorldService,
    @Optional() @Inject(RealtimeGateway)
    private readonly realtimeGateway?: RealtimeGateway,
  ) {}

  async processSubmissionReview(submissionId: string) {
    const submission = await this.prisma.agentSubmission.findUnique({
      where: { id: submissionId },
      include: {
        agentSession: true
      }
    });

    if (!submission) {
      return null;
    }

    const currentReview = await this.prisma.reviewResult.findUnique({
      where: { submissionId },
      select: { status: true }
    });

    if (!currentReview) {
      return null;
    }

    if (currentReview.status !== ReviewStatus.queued) {
      return this.prisma.reviewResult.findUnique({
        where: { submissionId }
      });
    }

    // Call LLM for real review, fallback to hardcoded on failure
    let suggestedScore = 85;
    let decision: ReviewDecision = ReviewDecision.approve;
    let rationale = "Clear goal, evidence of correction, and visible artifact.";

    if (isArkConfigured()) {
      try {
        const artifactsUrl = Array.isArray(submission.artifacts)
          ? (submission.artifacts as Array<{ url?: string }>).map((a) => a.url).filter(Boolean).join(", ")
          : "N/A";

        const reviewPrompt = [
          { role: "system" as const, content: "You are a teaching assistant reviewing a student submission." },
          { role: "user" as const, content: [
            `Submission summary: ${submission.workSummary}`,
            `Trigger type: ${submission.triggerType}`,
            `Artifacts: ${artifactsUrl || "N/A"}`,
            `Self reflection: ${submission.selfReflection}`,
            `Conversation summary: ${submission.conversationSummary}`,
            "",
            "Evaluate this submission and return JSON:",
            '{"suggestedScore": <0-100>, "decision": "approve"|"adjust"|"reject", "rationale": "<1-2 sentence explanation>"}'
          ].join("\n") }
        ];

        const llmResponse = await chat(reviewPrompt);
        const parsed = JSON.parse(llmResponse.trim());

        if (typeof parsed.suggestedScore === "number" && parsed.suggestedScore >= 0 && parsed.suggestedScore <= 100) {
          suggestedScore = parsed.suggestedScore;
        }
        if (parsed.decision === "approve" || parsed.decision === "adjust" || parsed.decision === "reject") {
          decision = parsed.decision as ReviewDecision;
        }
        if (typeof parsed.rationale === "string" && parsed.rationale.length > 0) {
          rationale = parsed.rationale;
        }
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        reviewLogger.warn(`LLM review failed for ${submissionId}: ${message}`);
        throw error;
      }
    }

    const sopRationale = await this.runSubmissionReviewSop(submission);
    if (sopRationale) {
      rationale = `${rationale}\n\n${sopRationale}`;
    }

    // A-020: Do NOT set finalScore during AI review — only the teacher
    // decision should set finalScore. Keep it null here.
    const updateResult = await this.prisma.reviewResult.updateMany({
      where: {
        submissionId,
        status: ReviewStatus.queued
      },
      data: {
        status: ReviewStatus.ai_reviewed,
        suggestedScore,
        finalScore: null,
        decision,
        rationale,
        aiReviewedAt: new Date()
      }
    });

    if (updateResult.count === 0) {
      return this.prisma.reviewResult.findUnique({
        where: { submissionId }
      });
    }

    const result = await this.prisma.reviewResult.findUnique({
      where: { submissionId }
    });
    await this.publishAvatarState(submission.studentId);
    return result;
  }

  async markNeedsTeacher(submissionId: string, error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    const result = await this.prisma.reviewResult.updateMany({
      where: {
        submissionId,
        status: ReviewStatus.queued
      },
      data: {
        status: ReviewStatus.needs_teacher,
        rationale: `AI review failed after retries: ${message}`.slice(0, 2_000)
      }
    });
    const submission = await this.prisma.agentSubmission.findUnique({
      where: { id: submissionId },
      select: { studentId: true },
    });
    if (submission) await this.publishAvatarState(submission.studentId);
    return result;
  }

  async listQueuedSubmissionIds(limit = 500) {
    const rows = await this.prisma.reviewResult.findMany({
      where: { status: ReviewStatus.queued },
      orderBy: { createdAt: "asc" },
      take: limit,
      select: { submissionId: true }
    });
    return rows.map((row) => row.submissionId);
  }

  private async runSubmissionReviewSop(submission: {
    id: string;
    studentId: string;
    workSummary: string;
    selfReflection: string;
    artifacts: unknown;
    agentEvaluationHints: unknown;
  }) {
    if (!this.sopEngine) return undefined;

    const input: SopInput = {
      submissionId: submission.id,
      workSummary: submission.workSummary,
      selfReflection: submission.selfReflection,
      artifacts: Array.isArray(submission.artifacts)
        ? submission.artifacts as SopInput["artifacts"]
        : [],
      agentEvaluationHints: Array.isArray(submission.agentEvaluationHints)
        ? submission.agentEvaluationHints.filter(
          (value): value is string => typeof value === "string"
        )
        : []
    };
    const result = await this.sopEngine.runSop("submission-review", input);

    if (this.memoryService) {
      await this.memoryService.observe(
        submission.studentId,
        "observation",
        `SOP评审结果 [submission:${submission.id}]: ${result.finalOutput}`,
        7,
        "agent-review"
      );
    }
    return result.finalOutput;
  }

  private async publishAvatarState(studentId: string) {
    if (!this.avatarService || !this.realtimeGateway) return;
    try {
      this.avatarService.invalidateCache();
      const state = await this.avatarService.getAvatarState(studentId);
      if (!state) return;

      let movement: Awaited<ReturnType<AgentWorldService["resetToRoleHome"]>>;
      if (
        (state.status === "working" || state.status === "reviewing")
        && state.agentRole
        && this.agentWorld
      ) {
        movement = await this.agentWorld.resetToRoleHome(
          studentId,
          state.agentRole,
        );
      }
      this.realtimeGateway.broadcastAgentStatus({
        studentId: state.studentId,
        displayName: state.displayName,
        status: state.status,
        currentZone: state.currentZone,
        activitySummary: state.activitySummary,
      });
      if (movement) this.realtimeGateway.broadcastAvatarMovement(movement);
    } catch {
      // A realtime presentation failure must not roll back a persisted review.
    }
  }
}

export function getReviewWorkerConcurrency(value = process.env.REVIEW_WORKER_CONCURRENCY) {
  const parsed = Number(value ?? 4);
  return Number.isInteger(parsed) && parsed > 0 && parsed <= 32 ? parsed : 4;
}

export function createReviewJobProcessor(
  service: ReviewProcessingService
): Processor<ReviewQueuePayload, ReviewProcessorResult> {
  return async (job: Job<ReviewQueuePayload>) => {
    try {
      const result = await service.processSubmissionReview(job.data.submissionId);
      if (!result) {
        throw new Error("Submission or review no longer exists");
      }
      return {
        submissionId: result.submissionId,
        status: result.status,
        suggestedScore: result.suggestedScore,
        finalScore: result.finalScore,
        decision: result.decision,
        rationale: result.rationale ?? ""
      };
    } catch (error: unknown) {
      const configuredAttempts = Math.max(1, Number(job.opts.attempts ?? 1));
      if (job.attemptsMade + 1 >= configuredAttempts) {
        await service.markNeedsTeacher(job.data.submissionId, error);
      }
      throw error;
    }
  };
}

export function createReviewWorker(service: ReviewProcessingService) {
  if (!isReviewQueueConfigured()) {
    throw new Error("Review worker requires REDIS_URL");
  }

  const worker = new Worker<ReviewQueuePayload, ReviewProcessorResult>(
    REVIEW_QUEUE_NAME,
    createReviewJobProcessor(service),
    {
      connection: getReviewQueueConnection(),
      concurrency: getReviewWorkerConcurrency()
    }
  );

  worker.on("error", (error: Error) => {
    reviewLogger.error(`Review worker error: ${error.message}`);
  });
  return worker;
}
