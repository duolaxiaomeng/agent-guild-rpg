import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import {
  ContributionKind,
  PrismaClient,
  QuestStatus,
  SubmissionTriggerType
} from "@prisma/client";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";
import { prepareTestDatabase } from "./support/test-database";

describe("world api", () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = await prepareTestDatabase("world-api");

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule]
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
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
    const response = await request(app.getHttpServer()).get("/world");

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
    await prisma.questDay.create({
      data: {
        id: "day-3",
        courseWorldId: "course-world-1",
        title: "Peer Review Prep",
        status: QuestStatus.completed
      }
    });

    const response = await request(app.getHttpServer()).get("/quests");

    expect(response.status).toBe(200);
    expect(response.body).toEqual([
      { id: "day-1", title: "First Agent Session", status: "open" },
      { id: "day-2", title: "Prompt Iteration", status: "locked" },
      { id: "day-3", title: "Peer Review Prep", status: "completed" }
    ]);
  });

  it("returns a student chat overview read model", async () => {
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
      .query({ studentId: "student-1" });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
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
      ]
    });
  });
});
