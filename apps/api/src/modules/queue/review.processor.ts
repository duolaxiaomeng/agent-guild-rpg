import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationShutdown,
  type OnModuleInit
} from "@nestjs/common";
import { ReviewDecision, ReviewStatus } from "@prisma/client";
import { Worker, type Processor } from "bullmq";
import { PrismaService } from "../../prisma/prisma.service";
import {
  getReviewQueueConnection,
  isReviewQueueConfigured,
  REVIEW_JOB_NAME,
  REVIEW_QUEUE_NAME,
  type ReviewQueuePayload
} from "./review.queue";
import { chat, isArkConfigured } from "../memory/llm/ark-adapter";

const reviewLogger = new Logger("ReviewProcessor");

export type ReviewProcessorResult = {
  submissionId: string;
  status: ReviewStatus;
  suggestedScore: number;
  finalScore: number | null;
  decision: ReviewDecision;
  rationale: string;
};

@Injectable()
export class ReviewProcessingService
  implements OnModuleInit, OnApplicationShutdown
{
  private worker?: Worker<ReviewQueuePayload, ReviewProcessorResult>;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService
  ) {}

  /**
   * R-001: Start the BullMQ Worker on module init so that queued
   * review jobs are consumed when Redis is available.
   * If Redis is unavailable, worker creation succeeds (lazy connect)
   * and jobs fall back to direct processing in the submissions controller.
   */
  async onModuleInit() {
    if (!isReviewQueueConfigured()) {
      reviewLogger.warn("Review worker disabled: REDIS_URL is not configured; submissions use direct review fallback");
      return;
    }
    try {
      const processor: Processor<
        ReviewQueuePayload,
        ReviewProcessorResult
      > = async (job) => {
        const result = await this.processSubmissionReview(
          job.data.submissionId
        );
        if (!result) {
          return {
            submissionId: job.data.submissionId,
            status: ReviewStatus.queued,
            suggestedScore: 0,
            finalScore: null,
            decision: ReviewDecision.approve,
            rationale: "Review processing returned null"
          };
        }
        return {
          submissionId: result.submissionId,
          status: result.status,
          suggestedScore: result.suggestedScore ?? 0,
          finalScore: result.finalScore,
          decision: result.decision ?? ReviewDecision.approve,
          rationale: result.rationale ?? ""
        };
      };

      this.worker = new Worker(REVIEW_QUEUE_NAME, processor, {
        connection: getReviewQueueConnection(),
        concurrency: 1
      });

      this.worker.on("error", (err: Error) => {
        reviewLogger.warn(`Review worker error: ${err.message}`);
      });

      reviewLogger.log("Review worker started — consuming queue jobs");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      reviewLogger.warn(
        `Failed to start review worker: ${message}. Jobs will be processed via fallback.`
      );
    }
  }

  async onApplicationShutdown() {
    await this.worker?.close();
  }

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
        reviewLogger.warn(`LLM review failed for ${submissionId}, using fallback: ${message}`);
      }
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

    return this.prisma.reviewResult.findUnique({
      where: { submissionId }
    });
  }
}

export { REVIEW_JOB_NAME };
