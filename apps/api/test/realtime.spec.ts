import { describe, expect, it, vi } from "vitest";
import { RealtimeGateway } from "../src/modules/realtime/realtime.gateway";
import { ReviewQueueService } from "../src/modules/queue/review.queue";

describe("realtime gateway", () => {
  it("emits a presence:update event with the latest player state", () => {
    const gateway = new RealtimeGateway();
    const emit = vi.fn();
    gateway.server = { emit } as never;

    gateway.broadcastPresence({
      userId: "11111111-1111-4111-8111-111111111111",
      location: "main_city",
      state: "online"
    });

    expect(emit).toHaveBeenCalledWith("presence:update", {
      userId: "11111111-1111-4111-8111-111111111111",
      location: "main_city",
      state: "online"
    });
  });
});

describe("review queue service", () => {
  it("returns a queued review job for a submission", async () => {
    const service = new ReviewQueueService();

    await expect(service.enqueue("submission-1")).resolves.toEqual({
      jobId: "review-submission-1",
      status: "queued"
    });
  });
});
