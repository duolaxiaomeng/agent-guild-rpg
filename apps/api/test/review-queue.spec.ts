import { describe, expect, it, vi } from "vitest";
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
});
