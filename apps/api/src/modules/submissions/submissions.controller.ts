import { Body, Controller, Post } from "@nestjs/common";

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
  @Post()
  create(@Body() body: SubmissionBody) {
    const submissionId = "submission-1";

    return {
      submission: {
        id: submissionId,
        ...body
      },
      review: this.createSuggestedReview(submissionId)
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
