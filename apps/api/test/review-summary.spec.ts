import { describe, expect, it, vi } from "vitest";
import { ReviewsController } from "../src/modules/reviews/reviews.controller";

describe("review queue summary", () => {
  it("separates queued AI work from reviews waiting for teacher decision", async () => {
    const count = vi
      .fn()
      .mockResolvedValueOnce(3) // total
      .mockResolvedValueOnce(2) // pending total
      .mockResolvedValueOnce(1) // queued
      .mockResolvedValueOnce(1) // ai reviewed
      .mockResolvedValueOnce(0) // reviewed today
      .mockResolvedValueOnce(0); // flagged
    const prisma = {
      reviewResult: {
        findMany: vi.fn().mockResolvedValue([]),
        count
      }
    };
    const controller = new ReviewsController(
      prisma as never,
      undefined as never,
      undefined as never,
      undefined as never
    );

    await expect(
      controller.list({ id: "teacher-1", role: "teacher", displayName: "Teacher Lin" })
    ).resolves.toMatchObject({
      summary: {
        pendingCount: 2,
        queuedCount: 1,
        pendingTeacherDecisionCount: 1,
        reviewedToday: 0,
        flaggedCount: 0
      }
    });
  });
});
