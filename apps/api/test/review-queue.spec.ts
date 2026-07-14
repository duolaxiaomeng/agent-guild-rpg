import { describe, expect, it, vi } from "vitest";

// Queue unit tests must never depend on a developer's ARK_API_KEY or make a
// real network request. The production processor still exercises the LLM when
// configured; this suite verifies deterministic fallback scoring only.
vi.mock("../src/modules/memory/llm/ark-adapter", () => ({
  isArkConfigured: () => false,
  chat: vi.fn()
}));

import { ReviewProcessingService } from "../src/modules/queue/review.processor";
import { ReviewQueueService } from "../src/modules/queue/review.queue";

describe("ReviewQueueService", () => {
  it("enqueues a BullMQ review job with a stable id and retention options", async () => {
    const add = vi.fn().mockResolvedValue(undefined);
    const service = new ReviewQueueService(() => ({ add }));

    const result = await service.enqueue("submission-1");

    expect(add).toHaveBeenCalledWith(
      "generate-review",
      { submissionId: "submission-1" },
      {
        jobId: "review-submission-1",
        removeOnComplete: true,
        removeOnFail: 100
      }
    );
    expect(result).toEqual({
      jobId: "review-submission-1",
      status: "queued"
    });
  });

  it("promotes a queued review into an ai-reviewed snapshot", async () => {
    const findSubmission = vi
      .fn()
      .mockResolvedValueOnce({
        id: "submission-1",
        conversationSummary:
          "Student compared expected and actual output, then corrected the prompt.",
        workSummary: "Student produced a README and screenshot.",
        selfReflection: "I learned to tell the agent what success looks like.",
        agentEvaluationHints: ["one correction loop"],
        agentSession: {
          provider: "claude-code"
        }
      });
    const findReview = vi
      .fn()
      .mockResolvedValueOnce({
        status: "queued"
      })
      .mockResolvedValueOnce({
        submissionId: "submission-1",
        status: "ai_reviewed",
        suggestedScore: 85,
        finalScore: null,
        decision: "approve",
        rationale: "Clear goal, evidence of correction, and visible artifact."
      });
    const updateMany = vi.fn().mockResolvedValue({
      count: 1
    });
    const resultReview = {
      submissionId: "submission-1",
      status: "ai_reviewed",
      suggestedScore: 85,
      finalScore: null,
      decision: "approve",
      rationale: "Clear goal, evidence of correction, and visible artifact."
    };
    const service = new ReviewProcessingService({
      agentSubmission: { findUnique: findSubmission },
      reviewResult: { findUnique: findReview, updateMany }
    } as never);

    const result = await service.processSubmissionReview("submission-1");

    expect(findSubmission).toHaveBeenCalledWith({
      where: { id: "submission-1" },
      include: {
        agentSession: true
      }
    });
    expect(findReview).toHaveBeenCalledWith({
      where: { submissionId: "submission-1" },
      select: { status: true }
    });
    expect(updateMany).toHaveBeenCalledWith({
      where: { submissionId: "submission-1", status: "queued" },
      data: {
        status: "ai_reviewed",
        suggestedScore: 85,
        finalScore: null,
        decision: "approve",
        rationale: "Clear goal, evidence of correction, and visible artifact.",
        aiReviewedAt: expect.any(Date)
      }
    });
    expect(findReview).toHaveBeenLastCalledWith({
      where: { submissionId: "submission-1" }
    });
    expect(result).toMatchObject(resultReview);
  });
});
