import { Body, Controller, Inject, Post } from "@nestjs/common";
import { ReviewDecision, UserRole } from "@prisma/client";
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
}
