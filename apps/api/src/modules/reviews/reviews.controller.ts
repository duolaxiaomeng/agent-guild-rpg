import { Body, Controller, Post } from "@nestjs/common";

type ReviewDecisionBody = {
  submissionId: string;
  finalScore: number;
  decision: string;
};

@Controller("reviews")
export class ReviewsController {
  @Post("decide")
  decide(@Body() body: ReviewDecisionBody) {
    return {
      submissionId: body.submissionId,
      finalScore: body.finalScore,
      decision: body.decision
    };
  }
}
