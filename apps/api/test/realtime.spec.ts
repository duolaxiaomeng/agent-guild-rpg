import { describe, expect, it, vi } from "vitest";
import { RealtimeGateway } from "../src/modules/realtime/realtime.gateway";
import { ReviewQueueService } from "../src/modules/queue/review.queue";

describe("realtime gateway", () => {
  it("emits a presence:update event with the latest player state", () => {
    const gateway = new RealtimeGateway({} as never);
    const emit = vi.fn();
    const to = vi.fn().mockReturnValue({ emit });
    gateway.server = { to } as never;

    gateway.broadcastPresence({
      userId: "11111111-1111-4111-8111-111111111111",
      location: "main_city",
      state: "online"
    });

    expect(to).toHaveBeenCalledWith("zone:main_city");
    expect(emit).toHaveBeenCalledWith("presence:update", {
      userId: "11111111-1111-4111-8111-111111111111",
      location: "main_city",
      state: "online"
    });
  });

  it("emits an agent-status:update event when broadcastAgentStatus is called", () => {
    const gateway = new RealtimeGateway({} as never);
    const emit = vi.fn();
    const to = vi.fn().mockReturnValue({ emit });
    gateway.server = { to } as never;

    gateway.broadcastAgentStatus({
      studentId: "student-1",
      displayName: "Lin",
      status: "working",
      currentZone: "workstations",
      activitySummary: "正在编码..."
    });

    expect(to).toHaveBeenCalledWith("zone:workstations");
    expect(emit).toHaveBeenCalledWith("agent-status:update", {
      studentId: "student-1",
      displayName: "Lin",
      status: "working",
      currentZone: "workstations",
      activitySummary: "正在编码..."
    });
  });

  it("validates and joins a classroom subscription room", async () => {
    const gateway = new RealtimeGateway({} as never);
    const join = vi.fn().mockResolvedValue(undefined);
    const client = { id: "socket-1", data: { userId: "teacher-1" }, join } as never;

    await expect(
      gateway.handleClassroomSubscribe({ sessionId: "classroom-session-1" }, client)
    ).resolves.toEqual({ sessionId: "classroom-session-1" });
    expect(join).toHaveBeenCalledWith("classroom:classroom-session-1");
  });

  it("rejects an unauthenticated classroom subscription", async () => {
    const gateway = new RealtimeGateway({} as never);
    const client = { id: "socket-1", data: {}, join: vi.fn() } as any;

    await expect(
      gateway.handleClassroomSubscribe({ sessionId: "classroom-session-1" }, client)
    ).resolves.toEqual({ error: "Authentication required" });
    expect(client.join).not.toHaveBeenCalled();
  });

  it("rejects a classroom subscription without a session id", async () => {
    const gateway = new RealtimeGateway({} as never);
    const client = { id: "socket-1", data: { userId: "teacher-1" }, join: vi.fn() } as any;

    await expect(
      gateway.handleClassroomSubscribe({ sessionId: "  " }, client)
    ).resolves.toEqual({ error: "sessionId is required" });
    expect(client.join).not.toHaveBeenCalled();
  });

  it("broadcasts classroom stage updates to the session room", () => {
    const gateway = new RealtimeGateway({} as never);
    const emit = vi.fn();
    const to = vi.fn().mockReturnValue({ emit });
    gateway.server = { to } as never;
    const payload = {
      sessionId: "classroom-session-1",
      version: 4,
      serverNow: "2026-07-12T10:00:00.000Z",
      currentStage: null
    };

    gateway.broadcastClassroomStageUpdate(payload);

    expect(to).toHaveBeenCalledWith("classroom:classroom-session-1");
    expect(emit).toHaveBeenCalledWith("classroom:stage:update", payload);
  });

  it("broadcasts classroom help updates to the session room", () => {
    const gateway = new RealtimeGateway({} as never);
    const emit = vi.fn();
    const to = vi.fn().mockReturnValue({ emit });
    gateway.server = { to } as never;
    const payload = {
      sessionId: "classroom-session-1",
      version: 2,
      serverNow: "2026-07-12T10:00:00.000Z",
      helpRequest: { id: "help-1", status: "open" }
    };

    gateway.broadcastClassroomHelpUpdate(payload);

    expect(to).toHaveBeenCalledWith("classroom:classroom-session-1");
    expect(emit).toHaveBeenCalledWith("classroom:help:update", payload);
  });
});

describe("review queue service", () => {
  it("returns a queued review job for a submission", async () => {
    const service = new ReviewQueueService(() => ({
      add: vi.fn().mockResolvedValue(undefined)
    }));

    await expect(service.enqueue("submission-1")).resolves.toEqual({
      jobId: "review-submission-1",
      status: "queued"
    });
  });
});
