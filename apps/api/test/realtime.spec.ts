import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { RealtimeGateway } from "../src/modules/realtime/realtime.gateway";
import { PresenceService } from "../src/modules/realtime/presence.service";
import { ReviewQueueService } from "../src/modules/queue/review.queue";

describe("realtime gateway", () => {
  it("hashes the raw handshake token before looking up a realtime session", async () => {
    const findUnique = vi.fn().mockResolvedValue({
      userId: "student-1",
      expiresAt: new Date(Date.now() + 60_000)
    });
    const gateway = new RealtimeGateway({ userSession: { findUnique } } as never);
    const client = {
      id: "socket-auth",
      handshake: { auth: { token: "session-raw-token" }, query: {} },
      data: {},
      join: vi.fn().mockResolvedValue(undefined),
      disconnect: vi.fn()
    } as any;

    await gateway.handleConnection(client);
    gateway.handleDisconnect(client);

    expect(findUnique).toHaveBeenCalledWith({
      where: {
        token: createHash("sha256").update("session-raw-token").digest("hex")
      }
    });
    expect(client.join).toHaveBeenCalledWith("room-chat-student-1");
    expect(client.join).toHaveBeenCalledWith("workstation:student-1");
    expect(client.disconnect).not.toHaveBeenCalled();
  });

  it("accepts the HttpOnly session cookie when handshake auth is unavailable", async () => {
    const findUnique = vi.fn().mockResolvedValue({
      userId: "student-1",
      expiresAt: new Date(Date.now() + 60_000)
    });
    const gateway = new RealtimeGateway({ userSession: { findUnique } } as never);
    const client = {
      id: "socket-cookie-auth",
      handshake: {
        auth: {},
        query: {},
        headers: { cookie: "agent-guild-session-token=session-cookie-token" }
      },
      data: {},
      join: vi.fn().mockResolvedValue(undefined),
      disconnect: vi.fn()
    } as any;

    await gateway.handleConnection(client);
    gateway.handleDisconnect(client);

    expect(findUnique).toHaveBeenCalledWith({
      where: {
        token: createHash("sha256").update("session-cookie-token").digest("hex")
      }
    });
    expect(client.disconnect).not.toHaveBeenCalled();
  });

  it("keeps a user online until their last browser socket disconnects", async () => {
    const findUnique = vi.fn().mockResolvedValue({
      userId: "student-1",
      expiresAt: new Date(Date.now() + 60_000)
    });
    const presence = new PresenceService();
    const gateway = new RealtimeGateway({ userSession: { findUnique } } as never, presence);
    const emit = vi.fn();
    gateway.server = { to: vi.fn().mockReturnValue({ emit }) } as never;
    const socket = (id: string) => ({
      id,
      handshake: { auth: { token: "session-raw-token" }, query: {} },
      data: {},
      join: vi.fn().mockResolvedValue(undefined),
      disconnect: vi.fn()
    }) as any;
    const first = socket("socket-1");
    const second = socket("socket-2");

    await gateway.handleConnection(first);
    await gateway.handleConnection(second);
    gateway.handleDisconnect(first);
    expect(presence.isOnline("student-1")).toBe(true);
    gateway.handleDisconnect(second);

    expect(presence.isOnline("student-1")).toBe(false);
    expect(emit).toHaveBeenCalledWith("presence:update", expect.objectContaining({ state: "online" }));
    expect(emit).toHaveBeenCalledWith("presence:update", expect.objectContaining({ state: "offline" }));
  });

  it("rejects a student from subscribing to another student's chat room", async () => {
    const gateway = new RealtimeGateway({
      user: {
        findUnique: vi.fn().mockImplementation(({ where }: { where: { id: string } }) =>
          Promise.resolve({ role: where.id === "student-1" ? "student" : "student" }))
      },
      roomAccessGrant: { findFirst: vi.fn().mockResolvedValue(null) }
    } as never);
    const client = {
      data: { userId: "student-2" },
      join: vi.fn()
    } as any;

    await expect(
      gateway.handleChatSubscribe({ roomId: "room-chat-student-1" }, client)
    ).resolves.toEqual({ error: "forbidden" });
    expect(client.join).not.toHaveBeenCalled();
  });

  it("allows a teacher to subscribe to a student chat room", async () => {
    const gateway = new RealtimeGateway({
      user: {
        findUnique: vi.fn().mockImplementation(({ where }: { where: { id: string } }) =>
          Promise.resolve({ role: where.id === "teacher-1" ? "teacher" : "student" }))
      }
    } as never);
    const join = vi.fn().mockResolvedValue(undefined);
    const client = { data: { userId: "teacher-1" }, join } as any;

    await expect(
      gateway.handleChatSubscribe({ roomId: "room-chat-student-1" }, client)
    ).resolves.toEqual({ roomId: "room-chat-student-1" });
    expect(join).toHaveBeenCalledWith("room-chat-student-1");
  });

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

  it("routes accepted avatar movement only to the student's private workstation", async () => {
    const movement = {
      commandId: "move-1",
      studentId: "student-1",
      zone: "workstations" as const,
      targetX: 468,
      targetY: 282,
      facing: "right" as const,
      revision: 2,
      source: "manual" as const,
      updatedAt: "2026-07-15T08:00:00.000Z",
    };
    const agentWorld = {
      moveAvatar: vi.fn().mockResolvedValue({ accepted: true, movement }),
    };
    const gateway = new RealtimeGateway(
      {} as never,
      undefined,
      agentWorld as never,
    );
    const emit = vi.fn();
    const to = vi.fn().mockReturnValue({ emit });
    gateway.server = { to } as never;

    await expect(
      gateway.handleAvatarMove(
        { commandId: "move-1", targetX: 468, targetY: 282 },
        { data: { userId: "student-1" } } as never,
      ),
    ).resolves.toEqual({ accepted: true, movement });
    expect(agentWorld.moveAvatar).toHaveBeenCalledWith("student-1", {
      commandId: "move-1",
      targetX: 468,
      targetY: 282,
    });
    expect(to).toHaveBeenCalledWith("workstation:student-1");
    expect(emit).toHaveBeenCalledWith("avatar:movement", movement);
  });

  it("rejects unauthenticated avatar movement", async () => {
    const gateway = new RealtimeGateway({} as never);

    await expect(
      gateway.handleAvatarMove(
        { commandId: "move-1", targetX: 468, targetY: 282 },
        { data: {} } as never,
      ),
    ).resolves.toEqual({
      accepted: false,
      reason: "authentication_required",
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
  it("fails fast when the default Redis queue is not configured", async () => {
    const previousRedisUrl = process.env.REDIS_URL;
    delete process.env.REDIS_URL;
    try {
      const service = new ReviewQueueService();
      await expect(service.enqueue("submission-no-redis")).rejects.toThrow(
        "REDIS_URL is not configured"
      );
    } finally {
      if (previousRedisUrl === undefined) delete process.env.REDIS_URL;
      else process.env.REDIS_URL = previousRedisUrl;
    }
  });

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
