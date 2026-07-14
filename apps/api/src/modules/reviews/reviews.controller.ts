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
  Post,
  Query,
  UseGuards
} from "@nestjs/common";
import { IsIn, IsNumber, IsOptional, IsString, Max, Min } from "class-validator";
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from "@nestjs/swagger";
import {
  MembershipStatus,
  ReviewDecision,
  ReviewStatus,
  UserRole,
  type Prisma
} from "@prisma/client";
import { AuthGuard } from "../auth/auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import { AgentAvatarService } from "../memory/agent-avatar/agent-avatar.service";
import { MemoryService } from "../memory/memory.service";
import { RealtimeGateway } from "../realtime/realtime.gateway";
import { PrismaService } from "../../prisma/prisma.service";

class DecideReviewDto {
  @IsString()
  submissionId!: string;

  @IsIn(["approve", "adjust", "reject"])
  decision!: string;

  @IsNumber()
  @Min(0)
  @Max(100)
  finalScore!: number;
}

@ApiTags("reviews")
@ApiBearerAuth()
@Controller("reviews")
@UseGuards(AuthGuard)
export class ReviewsController {
  private readonly logger = new Logger(ReviewsController.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(MemoryService) private readonly memoryService: MemoryService,
    @Inject(RealtimeGateway)
    private readonly realtimeGateway: RealtimeGateway,
    @Inject(AgentAvatarService)
    private readonly avatarService: AgentAvatarService
  ) {}

  @ApiOperation({
    summary: "获取所有评审列表",
    description: "教师专用端点，返回所有学生的提交评审状态，包含汇总统计信息。支持分页"
  })
  @ApiQuery({ name: "page", required: false, type: Number, description: "页码，默认 1" })
  @ApiQuery({ name: "pageSize", required: false, type: Number, description: "每页条数，默认 20" })
  @Get()
  async list(
    @CurrentUser() user: { id: string; role: UserRole; displayName: string },
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string
  ) {
    this.assertTeacher(user.role);

    // R-024: Add pagination with default page=1, pageSize=20
    const pageNum = page ? Math.max(1, parseInt(page, 10) || 1) : 1;
    const pageSizeNum = Math.min(
      100,
      Math.max(1, pageSize ? parseInt(pageSize, 10) || 20 : 20)
    );
    const skip = (pageNum - 1) * pageSizeNum;

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    // Fetch paginated reviews and summary counts in parallel
    const [reviews, total, pendingCount, queuedCount, pendingTeacherDecisionCount, reviewedToday, flaggedCount] =
      await Promise.all([
        this.prisma.reviewResult.findMany({
          include: {
            submission: {
              include: {
                day: true,
                student: {
                  include: {
                    memberships: {
                      where: {
                        status: MembershipStatus.active
                      },
                      include: {
                        guild: true
                      },
                      orderBy: { id: "asc" }
                    }
                  }
                }
              }
            }
          },
          orderBy: { submission: { submittedAt: "desc" } },
          skip,
          take: pageSizeNum
        }),
        this.prisma.reviewResult.count(),
        this.prisma.reviewResult.count({
          where: {
            status: { in: [ReviewStatus.queued, ReviewStatus.ai_reviewed] }
          }
        }),
        this.prisma.reviewResult.count({
          where: { status: ReviewStatus.queued }
        }),
        this.prisma.reviewResult.count({
          where: { status: ReviewStatus.ai_reviewed }
        }),
        this.prisma.reviewResult.count({
          where: {
            status: ReviewStatus.teacher_decided,
            decidedAt: { gte: todayStart }
          }
        }),
        this.prisma.reviewResult.count({
          where: {
            status: ReviewStatus.teacher_decided,
            decision: { in: [ReviewDecision.adjust, ReviewDecision.reject] }
          }
        })
      ]);

    const items = reviews.map((review) => this.toReviewListItem(review));

    return {
      summary: {
        pendingCount,
        queuedCount,
        pendingTeacherDecisionCount,
        reviewedToday,
        flaggedCount
      },
      items,
      pagination: {
        page: pageNum,
        pageSize: pageSizeNum,
        total
      }
    };
  }

  @ApiOperation({
    summary: "教师裁定评审",
    description: "教师对 AI 初评完成的提交进行最终裁定，设置最终分数和决定"
  })
  @Post("decide")
  async decide(
    @Body() body: DecideReviewDto,
    @CurrentUser() user: { id: string; role: UserRole; displayName: string }
  ) {
    this.assertTeacher(user.role);

    const validDecision = ReviewDecision[body.decision as keyof typeof ReviewDecision];
    if (!validDecision) {
      throw new BadRequestException(
        `Invalid decision: ${body.decision}. Must be one of: approve, adjust, reject`
      );
    }

    // R-018/A-017: Use CAS (Compare-And-Swap) via updateMany to prevent
    // TOCTOU race condition. Only updates if status is still 'ai_reviewed'.
    const result = await this.prisma.reviewResult.updateMany({
      where: {
        submissionId: body.submissionId,
        status: ReviewStatus.ai_reviewed
      },
      data: {
        status: ReviewStatus.teacher_decided,
        reviewerId: user.id,
        finalScore: body.finalScore,
        decision: ReviewDecision[body.decision as keyof typeof ReviewDecision],
        decidedAt: new Date()
      }
    });

    if (result.count === 0) {
      // Determine the appropriate error: not found vs wrong status
      const existing = await this.prisma.reviewResult.findUnique({
        where: { submissionId: body.submissionId },
        select: { status: true, submission: { select: { studentId: true } } }
      });

      if (!existing) {
        throw new NotFoundException(
          `评审记录不存在: submissionId=${body.submissionId}`
        );
      }

      throw new ConflictException("Review is not ready for teacher decision");
    }

    // Fetch the studentId for side effects (CAS succeeded)
    const reviewWithStudent = await this.prisma.reviewResult.findUnique({
      where: { submissionId: body.submissionId },
      select: { submission: { select: { studentId: true } } }
    });
    const studentId = reviewWithStudent?.submission.studentId;

    if (studentId) {
      // R-017: use .catch instead of void to avoid unhandled rejection
      this.memoryService
        .observe(
          studentId,
          "observation",
          `老师评审结果: ${body.decision}, 分数 ${body.finalScore}`,
          7.0
        )
        .catch((err: unknown) => {
          this.logger.error(
            `Memory observe failed: ${err instanceof Error ? err.message : String(err)}`
          );
        });

      this.broadcastAgentStatus(studentId).catch((err: unknown) => {
        this.logger.error(
          `Broadcast agent status failed: ${err instanceof Error ? err.message : String(err)}`
        );
      });
    }

    return {
      submissionId: body.submissionId,
      finalScore: body.finalScore,
      decision: body.decision
    };
  }

  @ApiOperation({
    summary: "学生查看自己的提交评审状态",
    description: "学生专用端点，返回当前学生自己的所有提交及其评审状态，按提交时间倒序排列"
  })
  @Get("my-submissions")
  async listMySubmissions(
    @CurrentUser() user: { id: string; role: UserRole; displayName: string }
  ) {
    if (user.role !== UserRole.student) {
      throw new ForbiddenException("Student access required");
    }

    const submissions = await this.prisma.agentSubmission.findMany({
      where: { studentId: user.id },
      include: { reviewResult: true, day: true },
      orderBy: { submittedAt: "desc" }
    });

    return {
      items: submissions.map((sub) => ({
        submissionId: sub.id,
        reviewStatus: sub.reviewResult?.status ?? "queued",
        suggestedScore: sub.reviewResult?.suggestedScore ?? null,
        finalScore:
          sub.reviewResult?.status === ReviewStatus.teacher_decided
            ? sub.reviewResult.finalScore
            : null,
        decision:
          sub.reviewResult?.status === ReviewStatus.teacher_decided
            ? sub.reviewResult.decision
            : null,
        rationale: sub.reviewResult?.rationale ?? null,
        submittedAt: sub.submittedAt.toISOString()
      }))
    };
  }

  private toReviewListItem(
    review: Prisma.ReviewResultGetPayload<{
      include: {
        submission: {
          include: {
            day: true;
            student: {
              include: {
                memberships: {
                  include: {
                    guild: true;
                  };
                };
              };
            };
          };
        };
      };
    }>
  ) {
    return {
      submissionId: review.submissionId,
      studentName: review.submission.student.displayName,
      guildName: review.submission.student.memberships[0]?.guild.name ?? "Unguilded",
      reviewStatus: review.status,
      suggestedScore: review.suggestedScore,
      finalScore: review.status === ReviewStatus.teacher_decided ? review.finalScore : null,
      decision: review.status === ReviewStatus.teacher_decided ? review.decision : null,
      isPendingTeacherDecision: review.status === ReviewStatus.ai_reviewed,
      rationale: review.rationale ?? "AI review queued.",
      dayLabel: this.toDayLabel(review.submission.day.id),
      submittedAt: review.submission.submittedAt.toISOString()
    };
  }

  private toDayLabel(dayId: string) {
    return `Day ${dayId.replace("day-", "")}`;
  }

  private assertTeacher(role: UserRole) {
    if (role !== UserRole.teacher) {
      throw new ForbiddenException("Teacher access required");
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
