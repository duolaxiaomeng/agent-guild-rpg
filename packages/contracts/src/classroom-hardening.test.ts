import { describe, expect, it } from "vitest";
import {
  agentEventBatchSchema,
  agentTaskFailSchema,
  agentTaskLeaseSchema,
  createGuildInvitationSchema,
  guildMembershipStatusSchema,
  reviewStatusSchema
} from "./index";

describe("40-person classroom contracts", () => {
  it("supports invitation decline and teacher takeover review state", () => {
    expect(createGuildInvitationSchema.parse({ email: "student@example.com" })).toEqual({
      email: "student@example.com"
    });
    expect(guildMembershipStatusSchema.parse("declined")).toBe("declined");
    expect(reviewStatusSchema.parse("needs_teacher")).toBe("needs_teacher");
  });

  it("accepts idempotent event batches", () => {
    expect(agentEventBatchSchema.parse({
      events: [{
        eventId: "connector-1:event-42",
        dayId: "day-1",
        type: "task.progress",
        payload: { percent: 50 },
        occurredAt: "2026-07-14T09:00:00.000Z"
      }]
    }).events).toHaveLength(1);
  });

  it("locks the lease and failure payload used by local connectors", () => {
    const lease = agentTaskLeaseSchema.parse({
      task: {
        id: "task-1",
        runId: "run-1",
        scope: {
          courseWorldId: "world-1",
          dayId: "day-1",
          guildId: null,
          studentId: "student-1"
        },
        provider: "codex",
        requiredCapabilities: ["coding"],
        priority: 100,
        resourceClass: "heavy",
        status: "leased",
        payload: { prompt: "implement" },
        attemptCount: 1,
        maxAttempts: 3,
        createdAt: "2026-07-14T09:00:00.000Z"
      },
      leaseToken: "0123456789abcdef0123456789abcdef",
      leaseExpiresAt: "2026-07-14T09:01:00.000Z"
    });

    expect(lease.heartbeatIntervalSeconds).toBe(15);
    expect(agentTaskFailSchema.parse({
      leaseToken: lease.leaseToken,
      kind: "infrastructure",
      error: "connector timed out"
    }).kind).toBe("infrastructure");
  });
});
