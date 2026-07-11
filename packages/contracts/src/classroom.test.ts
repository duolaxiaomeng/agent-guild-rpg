import { describe, expect, it } from "vitest";
import {
  classroomSnapshotSchema,
  createHelpRequestSchema,
  classroomControlInputSchema,
} from "./classroom";

describe("classroom contracts", () => {
  it("accepts a live snapshot with a running stage", () => {
    expect(classroomSnapshotSchema.parse({
      session: {
        id: "class-1",
        courseWorldId: "course-world-1",
        dayId: "day-1",
        status: "live",
        version: 3,
      },
      currentStage: {
        id: "stage-1",
        title: "个人实践",
        description: "完成今日切片",
        sortOrder: 1,
        durationSeconds: 1800,
        extensionSeconds: 300,
        status: "running",
        version: 2,
        startedAt: "2026-07-12T09:00:00.000Z",
        pausedAt: null,
        accumulatedPauseSeconds: 0,
      },
      stages: [],
      helpRequests: [],
      viewer: {
        role: "teacher",
        canControlStages: true,
        canHandleHelp: true,
      },
      serverNow: "2026-07-12T09:10:00.000Z",
    })).toMatchObject({ session: { status: "live" } });
  });

  it("rejects a help request without a non-empty message", () => {
    expect(() => createHelpRequestSchema.parse({
      sessionId: "class-1",
      category: "blocked",
      message: "",
    })).toThrow();
  });

  it("requires the expected version for a control action", () => {
    expect(() => classroomControlInputSchema.parse({ action: "pause" })).toThrow();
  });
});
