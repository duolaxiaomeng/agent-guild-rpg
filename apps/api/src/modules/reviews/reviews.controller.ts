import { Body, Controller, Get, Inject, Post } from "@nestjs/common";
import {
  MembershipStatus,
  ReviewDecision,
  UserRole,
  type Prisma
} from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";

type ReviewDecisionBody = {
  submissionId: string;
  finalScore: number;
  decision: string;
};

@Controller("reviews")
export class ReviewsController {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService
  ) {}

  @Get()
  async list() {
    const reviews = await this.prisma.reviewResult.findMany({
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
      }
    });

    const sortedReviews = [...reviews].sort(
      (left, right) =>
        right.submission.submittedAt.getTime() - left.submission.submittedAt.getTime()
    );

    const items = sortedReviews.map((review) => this.toReviewListItem(review));

    return {
      summary: {
        pendingCount: sortedReviews.filter((review) => review.reviewerId == null).length,
        reviewedToday: sortedReviews.filter((review) => review.reviewerId != null).length,
        flaggedCount: sortedReviews.filter(
          (review) =>
            review.decision === ReviewDecision.adjust ||
            review.decision === ReviewDecision.reject
        ).length
      },
      items
    };
  }

  @Post("decide")
  async decide(@Body() body: ReviewDecisionBody) {
    const teacher = await this.prisma.user.findFirst({
      where: { role: UserRole.teacher },
      orderBy: { id: "asc" }
    });

    await this.prisma.reviewResult.update({
      where: { submissionId: body.submissionId },
      data: {
        reviewerId: teacher?.id,
        finalScore: body.finalScore,
        decision: ReviewDecision[body.decision as keyof typeof ReviewDecision]
      }
    });

    return {
      submissionId: body.submissionId,
      finalScore: body.finalScore,
      decision: body.decision
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
      suggestedScore: review.suggestedScore,
      finalScore: review.finalScore,
      decision: review.decision,
      rationale: review.rationale,
      dayLabel: this.toDayLabel(review.submission.day.id),
      submittedAt: review.submission.submittedAt.toISOString()
    };
  }

  private toDayLabel(dayId: string) {
    return `Day ${dayId.replace("day-", "")}`;
  }
}
