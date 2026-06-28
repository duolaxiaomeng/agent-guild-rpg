import { Body, Controller, Inject, Post } from "@nestjs/common";
import { ReviewQueueService } from "../queue/review.queue";

type SubmissionBody = {
  studentId: string;
  courseWorldId: string;
  dayId: string;
  agentSessionId: string;
  triggerType: string;
  conversationSummary: string;
  workSummary: string;
  artifacts: Array<{
    kind: string;
    label: string;
    url: string;
  }>;
  selfReflection: string;
  agentEvaluationHints: string[];
  timestamp: string;
};

@Controller("submissions")
export class SubmissionsController {
  constructor(
    @Inject(ReviewQueueService)
    private readonly reviewQueue: ReviewQueueService
  ) {}

  @Post()
  async create(@Body() body: SubmissionBody) {
    const submissionId = "submission-1";
    const queue = await this.reviewQueue.enqueue(submissionId);

    return {
      submission: {
        id: submissionId,
        ...body
      },
      review: this.createSuggestedReview(submissionId),
      queue
    };
  }

  private createSuggestedReview(submissionId: string) {
    return {
      submissionId,
      suggestedScore: 85,
      finalScore: 85,
      decision: "approve",
      rationale: "Clear goal, evidence of correction, and visible artifact.",
      riskFlags: [] as string[]
    };
  }
}
