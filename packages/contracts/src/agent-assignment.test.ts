import { describe, expect, it } from "vitest";
import {
  agentAssignmentRunSchema,
  confirmAgentAssignmentSchema,
} from "./agent-assignment.js";

describe("agent assignment contracts", () => {
  it("accepts a completed local Agent run with persisted evidence", () => {
    const parsed = agentAssignmentRunSchema.parse({
      id: "task-1",
      runId: "day-1-student-1-frontend",
      studentId: "student-1",
      courseWorldId: "course-world-1",
      dayId: "day-1",
      guildId: null,
      provider: "codex-cli",
      input: { instruction: "完成 Day 1 页面并运行测试" },
      dependencies: [],
      requiredCapabilities: ["provider-process"],
      priority: 10,
      resourceClass: "heavy",
      status: "completed",
      attemptCount: 1,
      maxAttempts: 3,
      blockedByCount: 0,
      failureReason: null,
      result: {
        provider: "codex-cli",
        succeeded: true,
        exitCode: 0,
        output: "3 tests passed",
        outputTruncated: false,
        durationMs: 3200,
      },
      submission: null,
      createdAt: "2026-07-15T01:00:00.000Z",
      updatedAt: "2026-07-15T01:05:00.000Z",
    });

    expect(parsed.result).toMatchObject({ exitCode: 0 });
  });

  it("requires a meaningful student reflection before confirmation", () => {
    expect(
      confirmAgentAssignmentSchema.safeParse({
        runId: "day-1-student-1-frontend",
        selfReflection: "太短",
      }).success,
    ).toBe(false);
  });
});
