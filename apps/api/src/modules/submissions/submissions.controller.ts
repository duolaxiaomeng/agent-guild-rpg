import { Body, Controller, Inject, Post } from "@nestjs/common";
import {
  ReviewDecision,
  SubmissionTriggerType,
  type Prisma
} from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
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
    @Inject(PrismaService)
    private readonly prisma: PrismaService,
    @Inject(ReviewQueueService)
    private readonly reviewQueue: ReviewQueueService
  ) {}

  @Post()
  async create(@Body() body: SubmissionBody) {
    const created = await this.prisma.$transaction(async (tx) => {
      const submission = await tx.agentSubmission.create({
        data: {
          studentId: body.studentId,
          courseWorldId: body.courseWorldId,
          dayId: body.dayId,
          agentSessionId: body.agentSessionId,
          triggerType: this.toTriggerType(body.triggerType),
          conversationSummary: body.conversationSummary,
          workSummary: body.workSummary,
          artifacts: body.artifacts as Prisma.InputJsonValue,
          selfReflection: body.selfReflection,
          agentEvaluationHints: body.agentEvaluationHints as Prisma.InputJsonValue,
          submittedAt: new Date(body.timestamp)
        }
      });

      const review = await tx.reviewResult.create({
        data: {
          submissionId: submission.id,
          suggestedScore: 85,
          finalScore: 85,
          decision: ReviewDecision.approve,
          rationale: "Clear goal, evidence of correction, and visible artifact."
        }
      });

      return { submission, review };
    });

    const queue = await this.reviewQueue.enqueue(created.submission.id);

    return {
      submission: this.toSubmissionResponse(created.submission),
      review: this.toReviewResponse(created.review),
      queue
    };
  }

  private toTriggerType(triggerType: string) {
    return SubmissionTriggerType[
      triggerType as keyof typeof SubmissionTriggerType
    ];
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
      artifacts: submission.artifacts as SubmissionBody["artifacts"],
      selfReflection: submission.selfReflection,
      agentEvaluationHints:
        submission.agentEvaluationHints as SubmissionBody["agentEvaluationHints"],
      timestamp: submission.submittedAt.toISOString()
    };
  }

  private toReviewResponse(
    review: Awaited<ReturnType<PrismaService["reviewResult"]["create"]>>
  ) {
    return {
      submissionId: review.submissionId,
      suggestedScore: review.suggestedScore,
      finalScore: review.finalScore,
      decision: review.decision,
      rationale: review.rationale,
      riskFlags: [] as string[]
    };
  }
}
