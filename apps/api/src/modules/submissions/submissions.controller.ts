import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  Inject,
  Logger,
  NotFoundException,
  Optional,
  Param,
  Post,
  UseGuards
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import {
  AgentConnectorStatus,
  AgentSessionStatus,
  AgentTaskStatus,
  Prisma,
  ReviewStatus,
  SubmissionTriggerType,
  UserRole
} from "@prisma/client";
import {
  agentSubmissionSchema,
  confirmAgentAssignmentSchema,
  type AgentSubmission
} from "contracts";
import { PrismaService } from "../../prisma/prisma.service";
import { AuthGuard } from "../auth/auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import { AgentAvatarService } from "../memory/agent-avatar/agent-avatar.service";
import { ReviewQueueService } from "../queue/review.queue";
import { RealtimeGateway } from "../realtime/realtime.gateway";
import { AgentWorldService } from "../realtime/agent-world.service";

type SubmissionActor = {
  id: string;
  role: UserRole;
  displayName: string;
};

type QueueReceipt = {
  jobId: string;
  status: "queued" | "waiting_for_queue";
};

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
    @Inject(RealtimeGateway)
    private readonly realtimeGateway: RealtimeGateway,
    @Inject(AgentAvatarService)
    private readonly avatarService: AgentAvatarService,
    @Optional() @Inject(AgentWorldService)
    private readonly agentWorldService?: AgentWorldService,
  ) {}

  @ApiOperation({
    summary: "提交任务",
    description: "学生提交 Agent 工作成果，持久化后进入异步评审队列"
  })
  @Post()
  async create(@Body() body: unknown, @CurrentUser() user: SubmissionActor) {
    this.assertStudent(user);
    const input = this.parseSubmission(body);

    if (input.studentId !== user.id) {
      throw new ForbiddenException(
        "body.studentId must match the current student session"
      );
    }

    return this.persistSubmission(input, user, true);
  }

  @ApiOperation({
    summary: "确认 Agent 任务结果并提交评审",
    description: "学生确认自己的已完成任务，将 Connector 真实回传结果转成提交证据并进入异步评审队列"
  })
  @Post("from-agent-task")
  async createFromAgentTask(
    @Body() body: unknown,
    @CurrentUser() user: SubmissionActor
  ) {
    this.assertStudent(user);
    const confirmation = confirmAgentAssignmentSchema.safeParse(body);
    if (!confirmation.success) {
      throw new BadRequestException({
        message: "Invalid Agent task confirmation",
        errors: confirmation.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message
        }))
      });
    }

    const task = await this.prisma.agentTask.findUnique({
      where: { runId: confirmation.data.runId },
      include: {
        leaseOwner: {
          select: { studentId: true, agentSessionId: true }
        },
        attempts: {
          where: { status: "completed" },
          orderBy: { attemptNumber: "desc" },
          take: 1,
          include: {
            connector: {
              select: { studentId: true, agentSessionId: true }
            }
          }
        }
      }
    });
    if (!task) {
      throw new NotFoundException("Assigned Agent task was not found");
    }
    if (task.studentId !== user.id) {
      throw new ForbiddenException("Students can only submit their own Agent tasks");
    }
    if (task.status !== AgentTaskStatus.completed || task.result === null) {
      throw new ConflictException("Agent task must be completed before submission");
    }
    if (!task.courseWorldId || !task.dayId) {
      throw new BadRequestException(
        "Assigned Agent task must include courseWorldId and dayId"
      );
    }

    const connector = task.leaseOwner ?? task.attempts[0]?.connector;
    if (!connector || connector.studentId !== user.id) {
      throw new ConflictException(
        "Completed Agent task has no student-owned Connector evidence"
      );
    }

    const result = this.toResultRecord(task.result);
    const output = this.resultText(result, task.result);
    const input = this.parseSubmission({
      clientRequestId: `agent-task:${task.id}`,
      studentId: user.id,
      courseWorldId: task.courseWorldId,
      dayId: task.dayId,
      agentSessionId: connector.agentSessionId,
      triggerType: "button",
      conversationSummary: this.truncateSubmissionText(
        `老师下发 Agent 任务 ${task.runId}。执行指令：${this.taskInstruction(task.payload)}`
      ),
      workSummary: this.truncateSubmissionText(
        `Agent 任务 ${task.runId} 已完成，以下是 Connector 保存的真实回传结果：\n\n${output}`
      ),
      artifacts: [
        {
          kind: "command_log",
          label: `Agent 任务 ${task.runId} 执行证据`,
          url: `/agent-team#agent-run-${encodeURIComponent(task.id)}`
        }
      ],
      selfReflection: confirmation.data.selfReflection,
      agentEvaluationHints: this.buildTaskEvaluationHints(task.provider, result),
      timestamp: (task.completedAt ?? new Date()).toISOString()
    });

    return this.persistSubmission(input, user, false);
  }

  private async persistSubmission(
    input: AgentSubmission,
    user: SubmissionActor,
    requireActiveConnector: boolean
  ) {
    const existingRequest = await this.findIdempotentSubmission(
      user.id,
      input.clientRequestId
    );
    if (existingRequest?.reviewResult) {
      return this.toCreateResponse(
        existingRequest,
        existingRequest.reviewResult,
        await this.enqueueOrWait(existingRequest.id)
      );
    }

    if (requireActiveConnector) {
      await this.assertActiveConnector(input.agentSessionId, user.id);
    }

    try {
      const created = await this.prisma.$transaction(async (tx) => {
        const submission = await tx.agentSubmission.create({
          data: {
            clientRequestId: input.clientRequestId,
            pendingReviewKey: `${user.id}:${input.dayId}`,
            studentId: user.id,
            courseWorldId: input.courseWorldId,
            dayId: input.dayId,
            agentSessionId: input.agentSessionId,
            triggerType: SubmissionTriggerType[input.triggerType],
            conversationSummary: input.conversationSummary,
            workSummary: input.workSummary,
            artifacts: input.artifacts as unknown as Prisma.InputJsonValue,
            selfReflection: input.selfReflection,
            agentEvaluationHints:
              input.agentEvaluationHints as unknown as Prisma.InputJsonValue,
            submittedAt: new Date(input.timestamp)
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

      const queue = await this.enqueueOrWait(created.submission.id);
      this.broadcastAgentStatus(user.id).catch((error: unknown) => {
        this.logger.error(
          `Broadcast agent status failed: ${error instanceof Error ? error.message : String(error)}`
        );
      });
      return this.toCreateResponse(created.submission, created.review, queue);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        const duplicate = await this.findIdempotentSubmission(
          user.id,
          input.clientRequestId
        );
        if (duplicate?.reviewResult) {
          return this.toCreateResponse(
            duplicate,
            duplicate.reviewResult,
            await this.enqueueOrWait(duplicate.id)
          );
        }
        throw new ConflictException(
          "You already have a pending review for this day. Wait for the teacher to complete the review before resubmitting."
        );
      }
      throw error;
    }
  }

  private toResultRecord(value: Prisma.JsonValue) {
    return value && typeof value === "object" && !Array.isArray(value)
      ? value as Record<string, Prisma.JsonValue>
      : {};
  }

  private resultText(
    result: Record<string, Prisma.JsonValue>,
    rawResult: Prisma.JsonValue
  ) {
    if (typeof result.output === "string" && result.output.trim()) {
      return result.output.trim();
    }
    try {
      return JSON.stringify(rawResult, null, 2);
    } catch {
      return "Connector 已回传完成状态，但没有可展示的文本输出。";
    }
  }

  private taskInstruction(payload: Prisma.JsonValue) {
    if (payload && typeof payload === "object" && !Array.isArray(payload)) {
      const instruction = (payload as Record<string, Prisma.JsonValue>).instruction;
      if (typeof instruction === "string" && instruction.trim()) {
        return instruction.trim();
      }
    }
    return "按老师发布的任务要求执行并回传结果";
  }

  private buildTaskEvaluationHints(
    provider: string,
    result: Record<string, Prisma.JsonValue>
  ) {
    const exitCode = typeof result.exitCode === "number"
      ? String(result.exitCode)
      : "unknown";
    const durationMs = typeof result.durationMs === "number"
      ? String(result.durationMs)
      : "unknown";
    return [
      `Agent provider: ${provider}`,
      `Process exit code: ${exitCode}`,
      `Execution duration: ${durationMs}ms`,
      `Output truncated: ${result.outputTruncated === true ? "yes" : "no"}`
    ];
  }

  private truncateSubmissionText(value: string) {
    return value.trim().slice(0, 12000);
  }

  @ApiOperation({
    summary: "读取完整作业详情",
    description: "老师可读取任意提交；学生只能读取自己的提交"
  })
  @Get(":submissionId")
  async getDetail(
    @Param("submissionId") submissionId: string,
    @CurrentUser() user: SubmissionActor
  ) {
    const submission = await this.prisma.agentSubmission.findUnique({
      where: { id: submissionId },
      include: {
        student: { select: { id: true, displayName: true } },
        day: { select: { id: true, title: true } },
        agentSession: { select: { id: true, provider: true, status: true } },
        reviewResult: {
          include: {
            reviewer: { select: { id: true, displayName: true } }
          }
        }
      }
    });
    if (!submission) {
      throw new NotFoundException("Submission was not found");
    }
    if (user.role === UserRole.student && submission.studentId !== user.id) {
      throw new ForbiddenException("Students can only read their own submissions");
    }
    if (user.role !== UserRole.student && user.role !== UserRole.teacher) {
      throw new ForbiddenException("Student or teacher access required");
    }

    const events = await this.prisma.agentEvent.findMany({
      where: {
        studentId: submission.studentId,
        dayId: submission.dayId,
        connector: { agentSessionId: submission.agentSessionId }
      },
      orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
      take: 200
    });
    events.reverse();

    return {
      submission: {
        ...this.toSubmissionResponse(submission),
        studentName: submission.student.displayName,
        dayTitle: submission.day.title,
        agentProvider: submission.agentSession.provider,
        agentSessionStatus: submission.agentSession.status
      },
      review: submission.reviewResult
        ? {
            ...this.toReviewResponse(submission.reviewResult),
            reviewerName: submission.reviewResult.reviewer?.displayName ?? null,
            aiReviewedAt:
              submission.reviewResult.aiReviewedAt?.toISOString() ?? null,
            decidedAt: submission.reviewResult.decidedAt?.toISOString() ?? null
          }
        : null,
      agentEvents: events.map((event) => ({
        eventId: event.eventId,
        type: event.type,
        payload: event.payload,
        occurredAt: event.occurredAt.toISOString()
      }))
    };
  }

  private parseSubmission(body: unknown): AgentSubmission {
    const parsed = agentSubmissionSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        message: "Invalid submission payload",
        errors: parsed.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message
        }))
      });
    }
    return parsed.data;
  }

  private assertStudent(user: SubmissionActor) {
    if (user.role !== UserRole.student) {
      throw new ForbiddenException("Student access required");
    }
  }

  private async assertActiveConnector(agentSessionId: string, studentId: string) {
    const agentSession = await this.prisma.agentSession.findUnique({
      where: { id: agentSessionId },
      select: {
        studentId: true,
        status: true,
        connector: {
          select: { status: true, lastSeenAt: true }
        }
      }
    });
    if (!agentSession || agentSession.studentId !== studentId) {
      throw new ForbiddenException(
        "agentSessionId must belong to the current student"
      );
    }

    const heartbeatCutoff = new Date(Date.now() - 75_000);
    if (
      agentSession.status === AgentSessionStatus.failed ||
      agentSession.connector?.status !== AgentConnectorStatus.online ||
      agentSession.connector.lastSeenAt < heartbeatCutoff
    ) {
      throw new ConflictException(
        "An online Agent connector with a recent heartbeat is required"
      );
    }
  }

  private findIdempotentSubmission(studentId: string, clientRequestId: string) {
    return this.prisma.agentSubmission.findUnique({
      where: {
        studentId_clientRequestId: { studentId, clientRequestId }
      },
      include: { reviewResult: true }
    });
  }

  private async enqueueOrWait(submissionId: string): Promise<QueueReceipt> {
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    try {
      const receipt = await Promise.race([
        this.reviewQueue.enqueue(submissionId),
        new Promise<never>((_, reject) => {
          timeoutId = setTimeout(() => reject(new Error("Redis timeout")), 2_000);
        })
      ]);
      return receipt;
    } catch (error) {
      this.logger.warn(
        `Review queue unavailable for ${submissionId}: ${error instanceof Error ? error.message : String(error)}`
      );
      return {
        jobId: `review-${submissionId}`,
        status: "waiting_for_queue"
      };
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
  }

  private toCreateResponse(
    submission: {
      id: string;
      clientRequestId: string;
      studentId: string;
      courseWorldId: string;
      dayId: string;
      agentSessionId: string;
      triggerType: SubmissionTriggerType;
      conversationSummary: string;
      workSummary: string;
      artifacts: unknown;
      selfReflection: string;
      agentEvaluationHints: unknown;
      submittedAt: Date;
    },
    review: {
      submissionId: string;
      status: ReviewStatus;
      suggestedScore: number | null;
      finalScore: number | null;
      decision: string | null;
      rationale: string | null;
    },
    queue: QueueReceipt
  ) {
    return {
      submission: this.toSubmissionResponse(submission),
      review: this.toReviewResponse(review),
      queue
    };
  }

  private toSubmissionResponse(submission: {
    id: string;
    clientRequestId: string;
    studentId: string;
    courseWorldId: string;
    dayId: string;
    agentSessionId: string;
    triggerType: SubmissionTriggerType;
    conversationSummary: string;
    workSummary: string;
    artifacts: unknown;
    selfReflection: string;
    agentEvaluationHints: unknown;
    submittedAt: Date;
  }) {
    return {
      id: submission.id,
      clientRequestId: submission.clientRequestId,
      studentId: submission.studentId,
      courseWorldId: submission.courseWorldId,
      dayId: submission.dayId,
      agentSessionId: submission.agentSessionId,
      triggerType: submission.triggerType,
      conversationSummary: submission.conversationSummary,
      workSummary: submission.workSummary,
      artifacts: submission.artifacts,
      selfReflection: submission.selfReflection,
      agentEvaluationHints: submission.agentEvaluationHints,
      timestamp: submission.submittedAt.toISOString()
    };
  }

  private toReviewResponse(review: {
    submissionId: string;
    status: ReviewStatus;
    suggestedScore: number | null;
    finalScore: number | null;
    decision: string | null;
    rationale: string | null;
  }) {
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

  private async broadcastAgentStatus(studentId: string) {
    const state = await this.avatarService.getAvatarState(studentId);
    if (state) {
      let movement: Awaited<ReturnType<AgentWorldService["resetToRoleHome"]>>;
      if (
        (state.status === "working" || state.status === "reviewing") &&
        state.agentRole
      ) {
        movement = await this.agentWorldService?.resetToRoleHome(
          studentId,
          state.agentRole,
        );
      }
      this.realtimeGateway.broadcastAgentStatus({
        studentId: state.studentId,
        displayName: state.displayName,
        status: state.status,
        currentZone: state.currentZone,
        activitySummary: state.activitySummary
      });
      if (movement) this.realtimeGateway.broadcastAvatarMovement(movement);
    }
  }
}
