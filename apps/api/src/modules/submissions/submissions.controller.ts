import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Inject,
  Logger,
  Post,
  UseGuards
} from "@nestjs/common";
import {
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  ValidateNested
} from "class-validator";
import { Type } from "class-transformer";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import {
  UserRole,
  ReviewStatus,
  SubmissionTriggerType,
  type Prisma
} from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { AgentAvatarService } from "../memory/agent-avatar/agent-avatar.service";
import { AuthGuard } from "../auth/auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import { MemoryService } from "../memory/memory.service";
import { RealtimeGateway } from "../realtime/realtime.gateway";
import { ReviewProcessingService } from "../queue/review.processor";
import { ReviewQueueService } from "../queue/review.queue";
import { SopEngineService } from "../memory/teaching-agents/sop-engine.service";
import type { SopInput } from "../memory/teaching-agents/sop-engine.service";

class SubmissionArtifactDto {
  @IsString()
  kind!: string;

  @IsString()
  label!: string;

  @IsString()
  url!: string;
}

class CreateSubmissionDto {
  @IsString()
  studentId!: string;

  @IsString()
  courseWorldId!: string;

  @IsString()
  dayId!: string;

  @IsString()
  agentSessionId!: string;

  @IsIn(["button", "chat_command", "schedule"])
  triggerType!: string;

  @IsString()
  conversationSummary!: string;

  @IsString()
  workSummary!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SubmissionArtifactDto)
  artifacts!: SubmissionArtifactDto[];

  @IsString()
  selfReflection!: string;

  @IsArray()
  agentEvaluationHints!: string[];

  @IsOptional()
  @IsString()
  timestamp?: string;
}

@ApiTags("submissions")
@ApiBearerAuth()
@Controller("submissions")
@UseGuards(AuthGuard)
export class SubmissionsController {
  private readonly logger = new Logger(SubmissionsController.name);

  constructor(
    @Inject(PrismaService)
    private readonly prisma: PrismaService,
    @Inject(ReviewQueueService)
    private readonly reviewQueue: ReviewQueueService,
    @Inject(ReviewProcessingService)
    private readonly reviewProcessingService: ReviewProcessingService,
    @Inject(MemoryService)
    private readonly memoryService: MemoryService,
    @Inject(RealtimeGateway)
    private readonly realtimeGateway: RealtimeGateway,
    @Inject(AgentAvatarService)
    private readonly avatarService: AgentAvatarService,
    @Inject(SopEngineService)
    private readonly sopEngine: SopEngineService
  ) {}

  @ApiOperation({
    summary: "提交任务",
    description: "学生提交 Agent 工作成果，触发评审流程。返回提交记录、评审初始状态和队列追踪信息"
  })
  @Post()
  async create(
    @Body() body: CreateSubmissionDto,
    @CurrentUser() user: { id: string; role: UserRole; displayName: string }
  ) {
    if (user.role !== UserRole.student) {
      throw new ForbiddenException("Student access required");
    }

    if (body.studentId !== user.id) {
      throw new ForbiddenException(
        "body.studentId must match the current student session"
      );
    }

    // R-019: Prevent duplicate submissions for the same dayId
    // when a review is still pending (queued or ai_reviewed).
    const existingPending = await this.prisma.agentSubmission.findFirst({
      where: {
        studentId: user.id,
        dayId: body.dayId,
        reviewResult: {
          status: { in: [ReviewStatus.queued, ReviewStatus.ai_reviewed] }
        }
      },
      select: { id: true }
    });

    if (existingPending) {
      throw new ConflictException(
        "You already have a pending review for this day. Wait for the teacher to complete the review before resubmitting."
      );
    }

    const agentSession = await this.prisma.agentSession.findUnique({
      where: {
        id: body.agentSessionId
      },
      select: {
        studentId: true
      }
    });

    if (!agentSession || agentSession.studentId !== user.id) {
      throw new ForbiddenException(
        "agentSessionId must belong to the current student"
      );
    }

    const created = await this.prisma.$transaction(async (tx) => {
      const submission = await tx.agentSubmission.create({
        data: {
          studentId: user.id,
          courseWorldId: body.courseWorldId,
          dayId: body.dayId,
          agentSessionId: body.agentSessionId,
          triggerType: this.toTriggerType(body.triggerType),
          conversationSummary: body.conversationSummary,
          workSummary: body.workSummary,
          artifacts: body.artifacts as unknown as Prisma.InputJsonValue,
          selfReflection: body.selfReflection,
          agentEvaluationHints: body.agentEvaluationHints as unknown as Prisma.InputJsonValue,
          // Preserve the business submission timestamp supplied by the
          // client (when present) so review/read models remain auditable;
          // default to server time for legacy callers.
          submittedAt: body.timestamp ? new Date(body.timestamp) : new Date()
        }
      });

      const review = await tx.reviewResult.create({
        data: {
          submissionId: submission.id,
          status: ReviewStatus.queued,
          rationale: "AI review queued."
        }
      });

      return { submission, review };
    });

    let queue: { jobId: string; status: string } | null = null;
    let queueAvailable = false;
    // R-016: Track timeout to prevent orphan rejection
    let raceTimeoutId: ReturnType<typeof setTimeout> | undefined;
    try {
      queue = await Promise.race([
        this.reviewQueue.enqueue(created.submission.id),
        new Promise<never>((_, reject) => {
          raceTimeoutId = setTimeout(
            () => reject(new Error("Redis timeout")),
            2000
          );
        })
      ]);
      queueAvailable = true;
    } catch {
      // Redis unavailable — fall back to direct processing below
    } finally {
      if (raceTimeoutId) clearTimeout(raceTimeoutId);
    }

    if (!queueAvailable) {
      // Only process directly when the Redis queue is unavailable
      // R-017: use .catch instead of void to avoid unhandled rejection
      this.reviewProcessingService
        .processSubmissionReview(created.submission.id)
        .catch((err: unknown) => {
          this.logger.error(
            `Fallback review processing failed for ${created.submission.id}: ${err instanceof Error ? err.message : String(err)}`
          );
        });
    }

    // R-017: use .catch instead of void to avoid unhandled rejection
    this.memoryService
      .observe(
        user.id,
        "observation",
        `学生提交了任务: ${body.workSummary}`,
        5.0
      )
      .catch((err: unknown) => {
        this.logger.error(
          `Memory observe failed: ${err instanceof Error ? err.message : String(err)}`
        );
      });

    // Asynchronously trigger the submission-review SOP (non-blocking)
    // R-017: use .catch instead of void to avoid unhandled rejection
    this.triggerSubmissionReviewSop(created.submission).catch((err: unknown) => {
      this.logger.error(
        `SOP review trigger failed: ${err instanceof Error ? err.message : String(err)}`
      );
    });

    this.broadcastAgentStatus(user.id).catch((err: unknown) => {
      this.logger.error(
        `Broadcast agent status failed: ${err instanceof Error ? err.message : String(err)}`
      );
    });

    return {
      submission: this.toSubmissionResponse(created.submission),
      review: this.toReviewResponse(created.review),
      queue
    };
  }

  private toTriggerType(triggerType: string): SubmissionTriggerType {
    const value = SubmissionTriggerType[
      triggerType as keyof typeof SubmissionTriggerType
    ];
    if (!value) {
      throw new BadRequestException(
        `Invalid triggerType: '${triggerType}'. Must be one of: button, chat_command, schedule.`
      );
    }
    return value;
  }

  private toSubmissionResponse(
    submission: Awaited<ReturnType<PrismaService["agentSubmission"]["create"]>>
  ) {
    return {
      id: submission.id,
      studentId: submission.studentId,
      courseWorldId: submission.courseWorldId,
      dayId: submission.dayId,
      agentSessionId: submission.agentSessionId,
      triggerType: submission.triggerType,
      conversationSummary: submission.conversationSummary,
      workSummary: submission.workSummary,
      artifacts: submission.artifacts as unknown as CreateSubmissionDto["artifacts"],
      selfReflection: submission.selfReflection,
      agentEvaluationHints:
        submission.agentEvaluationHints as unknown as CreateSubmissionDto["agentEvaluationHints"],
      timestamp: submission.submittedAt.toISOString()
    };
  }

  private toReviewResponse(
    review: Awaited<ReturnType<PrismaService["reviewResult"]["create"]>>
  ) {
    return {
      submissionId: review.submissionId,
      status: review.status,
      suggestedScore: review.suggestedScore,
      finalScore: review.finalScore,
      decision: review.decision,
      rationale: review.rationale ?? "AI review queued.",
      riskFlags: [] as string[]
    };
  }

  /**
   * Asynchronously run the submission-review SOP and persist the result
   * into the student's agent memory as an observation.
   */
  private async triggerSubmissionReviewSop(submission: {
    id: string;
    studentId: string;
    workSummary: string;
    selfReflection: string;
    artifacts: unknown;
    agentEvaluationHints: unknown;
  }): Promise<void> {
    try {
      const input: SopInput = {
        submissionId: submission.id,
        workSummary: submission.workSummary,
        selfReflection: submission.selfReflection,
        artifacts: submission.artifacts as Array<{
          kind: string;
          label: string;
          url: string;
        }>,
        agentEvaluationHints: submission.agentEvaluationHints as string[],
      };

      const result = await this.sopEngine.runSop("submission-review", input);

      // A degraded/optional SOP implementation may intentionally return no
      // result. Do not touch the review row in that case; the queue/processor
      // remains the source of truth and avoids competing SQLite writes.
      if (!result) return;

      // R-003: Sync SOP review result to ReviewResult — update status
      // and AI suggestion (rationale) via CAS to avoid race conflicts.
      // Only updates if the review is still in 'queued' status.
      try {
        await this.prisma.reviewResult.updateMany({
          where: {
            submissionId: submission.id,
            status: ReviewStatus.queued
          },
          data: {
            status: ReviewStatus.ai_reviewed,
            rationale: result.finalOutput,
            aiReviewedAt: new Date()
          }
        });
      } catch (err: unknown) {
        this.logger.error(
          `SOP ReviewResult update failed for ${submission.id}: ${err instanceof Error ? err.message : String(err)}`
        );
      }

      await this.memoryService.observe(
        submission.studentId,
        "observation",
        `SOP评审结果 [submission:${submission.id}]: ${result.finalOutput}`,
        7.0
      );
    } catch (err: unknown) {
      // SOP execution failure should not disrupt the submission flow
      this.logger.error(
        `SOP review failed for ${submission.id}: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  private async broadcastAgentStatus(studentId: string) {
    const state = await this.avatarService.getAvatarState(studentId);
    if (state) {
      this.realtimeGateway.broadcastAgentStatus({
        studentId: state.studentId,
        displayName: state.displayName,
        status: state.status,
        currentZone: state.currentZone,
        activitySummary: state.activitySummary
      });
    }
  }
}
