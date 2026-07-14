import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import {
  ContributionKind,
  PrismaClient,
  QuestStatus,
  SubmissionTriggerType
} from "@prisma/client";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";
import { seedDatabase } from "../prisma/seed";
import { prepareTestDatabase } from "./support/test-database";

describe("world api", () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  async function loginAs(email: string, password: string) {
    const response = await request(app.getHttpServer()).post("/auth/login").send({
      email,
      password
    });

    expect(response.status).toBe(201);
    return response.body.token as string;
  }

  async function loginAsStudent() {
    return loginAs("lin@academy.test", "student-pass-123");
  }

  async function loginAsSecondStudent() {
    return loginAs("mo@academy.test", "student-pass-456");
  }

  beforeAll(async () => {
    prisma = await prepareTestDatabase("world-api");

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule]
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  beforeEach(async () => {
    await seedDatabase(prisma);
    // These tests exercise authorization and read-model shaping explicitly;
    // do not let seed grants/messages change the expected access or payload.
    await prisma.roomAccessGrant.deleteMany();
    await prisma.chatMessage.deleteMany();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it("returns a login payload for teacher and student roles", async () => {
    const teacherResponse = await request(app.getHttpServer())
      .post("/auth/login")
      .send({
        email: "teacher@academy.test",
        password: "teacher-pass-123"
      });

    const studentResponse = await request(app.getHttpServer())
      .post("/auth/login")
      .send({
        email: "lin@academy.test",
        password: "student-pass-123"
      });

    expect(teacherResponse.status).toBe(201);
    expect(teacherResponse.body).toMatchObject({
      token: expect.any(String),
      user: {
        role: "teacher",
        displayName: "Teacher Lin"
      }
    });
    expect(studentResponse.status).toBe(201);
    expect(studentResponse.body.user.role).toBe("student");
    expect(studentResponse.body.user.displayName).toBe("Lin");
  });

  it("returns the world shell payload", async () => {
    const token = await loginAsStudent();
    const response = await request(app.getHttpServer())
      .get("/world")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.currentDay).toBe(1);
    expect(response.body.location).toBe("main_city");
    expect(response.body.homesteads).toEqual([
      {
        ownerId: "student-1",
        displayName: "Lin",
        location: "homestead",
        isOnline: true
      },
      {
        ownerId: "student-2",
        displayName: "Mo",
        location: "homestead",
        isOnline: false
      },
      {
        ownerId: "student-3",
        displayName: "Kai",
        location: "homestead",
        isOnline: true
      }
    ]);
  });

  it("returns the day quest list", async () => {
    const token = await loginAsStudent();
    await prisma.questDay.create({
      data: {
        id: "day-3",
        courseWorldId: "course-world-1",
        title: "Peer Review Prep",
        status: QuestStatus.completed
      }
    });

    const response = await request(app.getHttpServer())
      .get("/quests")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual([
      expect.objectContaining({
        id: "day-1",
        dayId: "day-1",
        title: expect.any(String),
        status: "open",
        homework: expect.any(String),
        acceptanceCriteria: expect.any(Array)
      }),
      expect.objectContaining({
        id: "day-2",
        dayId: "day-2",
        title: expect.any(String),
        status: "locked",
        homework: expect.any(String),
        acceptanceCriteria: expect.any(Array)
      }),
      expect.objectContaining({
        id: "day-3",
        dayId: "day-3",
        title: "Peer Review Prep",
        status: "completed"
      })
    ]);
  });

  it("returns a student chat overview read model", async () => {
    const studentToken = await loginAsStudent();
    await prisma.reviewResult.deleteMany();
    await prisma.agentSubmission.deleteMany();
    await prisma.agentSubmission.create({
      data: {
        id: "submission-1",
        studentId: "student-1",
        courseWorldId: "course-world-1",
        dayId: "day-1",
        agentSessionId: "session-1",
        triggerType: SubmissionTriggerType.button,
        conversationSummary: "最近一次对话聚焦 README 打磨与截图整理。",
        workSummary: "README、截图与提示词修正已提交。",
        artifacts: [
          {
            kind: "doc",
            label: "README",
            url: "https://example.com/readme"
          }
        ],
        selfReflection: "我知道该怎么告诉 Agent 成功标准。",
        agentEvaluationHints: ["one correction loop"],
        submittedAt: new Date("2026-06-29T10:00:00.000Z")
      }
    });

    await prisma.reviewResult.create({
      data: {
        submissionId: "submission-1",
        suggestedScore: 85,
        rationale: "Clear goal, evidence of correction, and visible artifact."
      }
    });

    await prisma.contributionLog.createMany({
      data: [
        {
          id: "contribution-1",
          actorId: "student-2",
          targetUserId: "student-1",
          kind: ContributionKind.collaboration,
          points: 4
        },
        {
          id: "contribution-2",
          actorId: "student-3",
          targetUserId: "student-1",
          kind: ContributionKind.peer_review,
          points: 2
        }
      ]
    });

    const response = await request(app.getHttpServer())
      .get("/chat")
      .set("Authorization", `Bearer ${studentToken}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      roomId: "room-chat-student-1",
      viewerRole: "owner",
      hasMore: false,
      studentId: "student-1",
      studentName: "Lin",
      agentLabel: "Claude Code",
      sessionStatus: "active",
      sessionSummary: "最近一次对话聚焦 README 打磨与截图整理。",
      latestSubmission: {
        id: "submission-1",
        statusLabel: "待老师审核",
        submittedAt: "2026-06-29T10:00:00.000Z",
        dayLabel: "Day 1"
      },
      collaborationGuests: [
        {
          studentId: "student-2",
          studentName: "Mo",
          contributionLabel: "协作贡献 4"
        },
        {
          studentId: "student-3",
          studentName: "Kai",
          contributionLabel: "协作贡献 2"
        }
      ],
      messages: []
    });
  });

  it("rejects a student from reading another student's room without an approved grant", async () => {
    const outsiderToken = await loginAsSecondStudent();

    const response = await request(app.getHttpServer())
      .get("/chat?roomId=room-chat-student-1")
      .set("Authorization", `Bearer ${outsiderToken}`);

    expect(response.status).toBe(403);
    expect(response.body.message).toBe("Cannot access this chat room");
  });

  it("lets an approved grantee read another student's room messages", async () => {
    const ownerToken = await loginAsStudent();
    const granteeToken = await loginAsSecondStudent();

    await request(app.getHttpServer())
      .post("/rooms/access-grants")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({
        roomId: "room-chat-student-1",
        granteeId: "student-2",
        scope: "chat_summary",
        expiresInHours: 24
      });

    await prisma.agentSubmission.create({
      data: {
        id: "submission-room-1",
        studentId: "student-1",
        courseWorldId: "course-world-1",
        dayId: "day-1",
        agentSessionId: "session-1",
        triggerType: SubmissionTriggerType.button,
        conversationSummary: "聊天室房主补充了最新修正记录。",
        workSummary: "README 与验证截图已整理。",
        artifacts: [
          {
            kind: "doc",
            label: "README",
            url: "https://example.com/readme"
          }
        ],
        selfReflection: "我开始用更明确的成功标准描述任务。",
        agentEvaluationHints: ["chat room snapshot"],
        submittedAt: new Date("2026-06-29T11:00:00.000Z")
      }
    });

    await prisma.reviewResult.create({
      data: {
        submissionId: "submission-room-1",
        rationale: "AI review queued."
      }
    });

    const response = await request(app.getHttpServer())
      .get("/chat?roomId=room-chat-student-1")
      .set("Authorization", `Bearer ${granteeToken}`);

    expect(response.status).toBe(200);
    expect(response.body.viewerRole).toBe("guest");
    expect(response.body.roomId).toBe("room-chat-student-1");
    expect(response.body.messages).toEqual([]);
    expect(response.body.studentId).toBe("student-1");
    expect(response.body.studentName).toBe("Lin");
  });

  it("persists a text chat message for a room member", async () => {
    const ownerToken = await loginAsStudent();

    const response = await request(app.getHttpServer())
      .post("/chat/messages")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({
        roomId: "room-chat-student-1",
        body: "我刚把 README 和截图整理好了，准备提交。"
      });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      roomId: "room-chat-student-1",
      authorId: "student-1",
      authorName: "Lin",
      body: "我刚把 README 和截图整理好了，准备提交。"
    });

    const persistedMessage = await prisma.chatMessage.findUnique({
      where: { id: response.body.id }
    });

    expect(persistedMessage).toMatchObject({
      roomId: "room-chat-student-1",
      authorId: "student-1",
      body: "我刚把 README 和截图整理好了，准备提交。"
    });
  });
});
