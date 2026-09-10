import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import {
  PrismaClient,
  AgentTaskStatus,
  ReviewStatus,
  SubmissionTriggerType
} from "@prisma/client";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";
import { PresenceService } from "../src/modules/realtime/presence.service";
import { AgentWorldService } from "../src/modules/realtime/agent-world.service";
import { seedDatabase } from "../prisma/seed";
import { prepareTestDatabase } from "./support/test-database";

describe("agent avatar api", () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let studentToken: string;
  let presence: PresenceService;
  let agentWorld: AgentWorldService;

  async function loginAsStudent() {
    const response = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email: "lin@academy.test", password: "student-pass-123" });
    expect(response.status).toBe(201);
    return response.body.token as string;
  }

  function get(path: string) {
    return request(app.getHttpServer())
      .get(path)
      .set("Authorization", `Bearer ${studentToken}`);
  }

  beforeAll(async () => {
    prisma = await prepareTestDatabase("agent-avatar");

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule]
    }).compile();

    presence = moduleRef.get(PresenceService);
    agentWorld = moduleRef.get(AgentWorldService);

    app = moduleRef.createNestApplication();
    await app.init();
  });

  beforeEach(async () => {
    await seedDatabase(prisma);
    await prisma.reviewResult.deleteMany();
    await prisma.agentSubmission.deleteMany();
    await prisma.agentTeamBinding.deleteMany();
    presence.clear();
    presence.connect("student-1", "avatar-test-lin");
    presence.connect("student-3", "avatar-test-kai");
    studentToken = await loginAsStudent();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it("GET /agent-avatars includes browser users and connected teacher Agents", async () => {
    await prisma.agentSession.create({
      data: {
        id: "teacher-avatar-session",
        studentId: "teacher-1",
        provider: "codex-cli",
        status: "active",
      },
    });
    await prisma.agentConnector.create({
      data: {
        id: "teacher-avatar-connector",
        studentId: "teacher-1",
        agentSessionId: "teacher-avatar-session",
        provider: "codex-cli",
        clientName: "teacher-local-agent",
        tokenHash: "teacher-avatar-token-hash",
        status: "online",
        capabilities: ["events"],
        lastSeenAt: new Date(),
      },
    });

    const response = await get("/agent-avatars");

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body)).toBe(true);
    expect(response.body).toHaveLength(3);

    // student-1 (Lin) is online with an active agent session
    const lin = response.body.find((a: any) => a.studentId === "student-1");
    expect(lin).toBeDefined();
    expect(lin.displayName).toBe("Lin");
    expect(lin.status).toBe("idle");
    expect(lin.currentZone).toBe("workstations");
    expect(lin.activitySummary).toBe("空闲");

    // student-2 (Mo) is not connected, so it is absent from the public list.
    const mo = response.body.find((a: any) => a.studentId === "student-2");
    expect(mo).toBeUndefined();

    // student-3 (Kai) is online
    const kai = response.body.find((a: any) => a.studentId === "student-3");
    expect(kai).toBeDefined();
    expect(kai.displayName).toBe("Kai");
    expect(kai.status).toBe("idle");

    const teacher = response.body.find((a: any) => a.studentId === "teacher-1");
    expect(teacher).toMatchObject({
      displayName: "Teacher Lin",
      status: "idle",
      ownerRole: "teacher",
      agentRole: null,
      visualRole: "lead",
    });
  });

  it("adds the selected visual role and keeps offline members out of the team roster", async () => {
    await prisma.agentTeamBinding.create({
      data: { studentId: "student-2", roleKey: "reviewer" },
    });

    const bindingResponse = await request(app.getHttpServer())
      .put("/agent-team/me")
      .set("Authorization", `Bearer ${studentToken}`)
      .send({ roleKey: "frontend-developer" });
    expect(bindingResponse.status).toBe(200);

    const avatarResponse = await get("/agent-avatars/student-1");
    expect(avatarResponse.status).toBe(200);
    expect(avatarResponse.body).toMatchObject({
      agentRole: "frontend-developer",
      visualRole: "coder",
    });

    const privateAvatarResponse = await get("/agent-avatars/me");
    expect(privateAvatarResponse.status).toBe(200);
    expect(privateAvatarResponse.body).toMatchObject({
      studentId: "student-1",
      agentRole: "frontend-developer",
      visualRole: "coder",
      movementLocked: false,
      movementLockReason: null,
      position: {
        zone: "workstations",
        x: 316,
        y: 214,
        facing: "left",
        revision: 0,
      },
    });
    await expect(
      prisma.agentWorldState.findUnique({ where: { studentId: "student-1" } }),
    ).resolves.toMatchObject({ positionX: 316, positionY: 214 });

    const moved = await agentWorld.moveAvatar("student-1", {
      commandId: "move-to-corridor",
      targetX: 468,
      targetY: 282,
    });
    expect(moved).toMatchObject({
      accepted: true,
      movement: { targetX: 468, targetY: 282, revision: 1 },
    });
    await expect(
      agentWorld.moveAvatar("teacher-1", {
        commandId: "teacher-move",
        targetX: 468,
        targetY: 282,
      }),
    ).resolves.toEqual({ accepted: false, reason: "student_only" });
    await expect(
      agentWorld.moveAvatar("student-1", {
        commandId: "move-into-desk",
        targetX: 122,
        targetY: 214,
      }),
    ).resolves.toEqual({ accepted: false, reason: "invalid_target" });

    const rosterResponse = await get("/agent-team/roster");
    expect(rosterResponse.status).toBe(200);
    expect(rosterResponse.body).toHaveLength(1);
    expect(rosterResponse.body[0]).toMatchObject({
      studentId: "student-1",
      agentRole: "frontend-developer",
      visualRole: "coder",
    });
  });

  it("GET /agent-avatars/:studentId returns a single avatar", async () => {
    const response = await get("/agent-avatars/student-1");

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      studentId: "student-1",
      displayName: "Lin",
      status: "idle",
      currentZone: "workstations"
    });
  });

  it("serializes rapid clicks so the latest command owns the newest revision", async () => {
    await prisma.agentTeamBinding.create({
      data: { studentId: "student-1", roleKey: "ta" },
    });

    const [first, second] = await Promise.all([
      agentWorld.moveAvatar("student-1", {
        commandId: "rapid-1",
        targetX: 468,
        targetY: 282,
      }),
      agentWorld.moveAvatar("student-1", {
        commandId: "rapid-2",
        targetX: 500,
        targetY: 300,
      }),
    ]);

    expect(first).toMatchObject({
      accepted: true,
      movement: { commandId: "rapid-1", revision: 1 },
    });
    expect(second).toMatchObject({
      accepted: true,
      movement: { commandId: "rapid-2", revision: 2 },
    });
    await expect(
      prisma.agentWorldState.findUnique({ where: { studentId: "student-1" } }),
    ).resolves.toMatchObject({ positionX: 500, positionY: 300, revision: 2 });
  });

  it("derives working status from a real leased or running Agent task", async () => {
    await prisma.agentTeamBinding.create({
      data: { studentId: "student-1", roleKey: "ta" },
    });
    await expect(
      agentWorld.moveAvatar("student-1", {
        commandId: "move-before-task",
        targetX: 468,
        targetY: 282,
      }),
    ).resolves.toMatchObject({ accepted: true });
    await prisma.agentTask.create({
      data: {
        runId: "avatar-running-task",
        studentId: "student-1",
        provider: "codex-cli",
        status: AgentTaskStatus.running,
        payload: { instruction: "实现界面" },
        startedAt: new Date(),
      },
    });

    await prisma.agentSubmission.create({
      data: {
        id: "avatar-submission-working",
        studentId: "student-1",
        courseWorldId: "course-world-1",
        dayId: "day-1",
        agentSessionId: "session-1",
        triggerType: SubmissionTriggerType.button,
        conversationSummary: "Working on the latest task.",
        workSummary: "正在实现界面...",
        artifacts: [],
        selfReflection: "Making good progress.",
        agentEvaluationHints: [],
        submittedAt: new Date()
      }
    });

    const response = await get("/agent-avatars/student-1");

    expect(response.status).toBe(200);
    expect(response.body.status).toBe("working");
    expect(response.body.activitySummary).toContain("avatar-running-task");
    await expect(
      agentWorld.resetToRoleHome("student-1", "ta", "task-lock-home"),
    ).resolves.toMatchObject({
      commandId: "task-lock-home",
      targetX: 122,
      targetY: 214,
      source: "system",
      revision: 2,
    });
    await expect(
      prisma.agentWorldState.findUnique({ where: { studentId: "student-1" } }),
    ).resolves.toMatchObject({ positionX: 122, positionY: 214, revision: 2 });
    await expect(
      agentWorld.moveAvatar("student-1", {
        commandId: "move-while-working",
        targetX: 468,
        targetY: 282,
      }),
    ).resolves.toEqual({ accepted: false, reason: "movement_locked" });

    await prisma.agentTask.delete({ where: { runId: "avatar-running-task" } });
    const unlocked = await get("/agent-avatars/student-1");
    expect(unlocked.status).toBe(200);
    expect(unlocked.body.status).toBe("idle");
    await expect(
      agentWorld.moveAvatar("student-1", {
        commandId: "move-after-task",
        targetX: 468,
        targetY: 282,
      }),
    ).resolves.toMatchObject({ accepted: true });
  });

  it("derives reviewing status when a student has a pending review", async () => {
    // Create an older submission (outside working window) with a queued review
    const oldDate = new Date(Date.now() - 60 * 60 * 1000); // 1 hour ago
    await prisma.agentSubmission.create({
      data: {
        id: "avatar-submission-reviewing",
        studentId: "student-3",
        courseWorldId: "course-world-1",
        dayId: "day-1",
        agentSessionId: "session-1",
        triggerType: SubmissionTriggerType.button,
        conversationSummary: "Submitted for review.",
        workSummary: "Review pending task.",
        artifacts: [],
        selfReflection: "Waiting for feedback.",
        agentEvaluationHints: [],
        submittedAt: oldDate
      }
    });

    await prisma.reviewResult.create({
      data: {
        submissionId: "avatar-submission-reviewing",
        status: ReviewStatus.queued,
        rationale: "AI review queued."
      }
    });

    const response = await get("/agent-avatars/student-3");

    expect(response.status).toBe(200);
    expect(response.body.status).toBe("reviewing");
    expect(response.body.activitySummary).toContain("排队等待");
  });

  it("derives online status when a student has recent memory activity", async () => {
    await prisma.agentMemory.create({
      data: {
        studentId: "student-1",
        type: "observation",
        content: "学生正在浏览课程材料",
        importance: 5.0
      }
    });

    // Clean up the working submission so it doesn't override
    await prisma.reviewResult.deleteMany({
      where: { submission: { studentId: "student-1" } }
    });
    await prisma.agentSubmission.deleteMany({
      where: { studentId: "student-1" }
    });

    const response = await get("/agent-avatars/student-1");

    expect(response.status).toBe(200);
    expect(response.body.status).toBe("online");
    expect(response.body.activitySummary).toContain("浏览课程材料");
  });

  it("filters avatars by zone", async () => {
    const moveResponse = await request(app.getHttpServer())
      .put("/agent-avatars/me/zone")
      .set("Authorization", `Bearer ${studentToken}`)
      .send({ zone: "collab-room" });
    expect(moveResponse.status).toBe(200);
    expect(moveResponse.body).toMatchObject({
      studentId: "student-1",
      currentZone: "collab-room",
    });

    const response = await get("/agent-avatars?zone=collab-room");

    expect(response.status).toBe(200);
    expect(response.body).toEqual([
      expect.objectContaining({
        studentId: "student-1",
        currentZone: "collab-room",
      }),
    ]);
  });

  it("returns offline status for offline students", async () => {
    const response = await get("/agent-avatars/student-2");

    expect(response.status).toBe(200);
    expect(response.body.status).toBe("offline");
    expect(response.body.activitySummary).toBe("离线");
  });

  it("returns 404 for non-existent student", async () => {
    const response = await get("/agent-avatars/non-existent-student");

    expect(response.status).toBe(404);
  });
});
