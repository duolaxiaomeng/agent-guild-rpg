import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { AgentSessionStatus, PrismaClient } from "@prisma/client";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { seedDatabase } from "../prisma/seed";
import { AppModule } from "../src/app.module";
import { ReviewQueueService } from "../src/modules/queue/review.queue";
import { prepareTestDatabase } from "./support/test-database";

describe("submission flow", () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = await prepareTestDatabase("submission-flow");

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule]
    })
      .overrideProvider(ReviewQueueService)
      .useValue({
        enqueue: async (submissionId: string) => ({
          jobId: `review-${submissionId}`,
          status: "queued" as const
        })
      })
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  beforeEach(async () => {
    await seedDatabase(prisma);
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it("lists seeded guilds and persists a created guild", async () => {
    const listResponse = await request(app.getHttpServer()).get("/guilds");
    const createResponse = await request(app.getHttpServer())
      .post("/guilds")
      .send({
        name: "Night Shift",
        description: "Students pair on daily agent quests and share review notes."
      });
    const refreshedListResponse = await request(app.getHttpServer()).get("/guilds");

    expect(listResponse.status).toBe(200);
    expect(listResponse.body).toEqual([
      {
        id: "guild-1",
        name: "Morning Forge",
        memberCount: 3,
        collaborationPoints: 12
      }
    ]);

    expect(createResponse.status).toBe(201);
    expect(createResponse.body).toEqual({
      id: expect.any(String),
      name: "Night Shift",
      description: "Students pair on daily agent quests and share review notes.",
      memberCount: 1,
      collaborationPoints: 0
    });

    expect(refreshedListResponse.status).toBe(200);
    expect(refreshedListResponse.body).toEqual([
      {
        id: "guild-1",
        name: "Morning Forge",
        memberCount: 3,
        collaborationPoints: 12
      },
      {
        id: createResponse.body.id,
        name: "Night Shift",
        memberCount: 1,
        collaborationPoints: 0
      }
    ]);
  });

  it("creates a room access grant", async () => {
    const response = await request(app.getHttpServer())
      .post("/rooms/access-grants")
      .send({
        roomId: "room-1",
        granteeId: "11111111-1111-4111-8111-111111111111"
      });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      roomId: "room-1",
      granteeId: "11111111-1111-4111-8111-111111111111",
      status: "approved",
      scope: "chat_summary"
    });
    expect(response.body.id).toEqual(expect.any(String));
    expect(response.body.createdAt).toEqual(expect.any(String));
    expect(response.body.expiresAt).toEqual(expect.any(String));
  });

  it("accepts a student submission and returns a suggested review", async () => {
    const response = await request(app.getHttpServer())
      .post("/submissions")
      .send({
        studentId: "student-1",
        courseWorldId: "course-world-1",
        dayId: "day-1",
        agentSessionId: "session-1",
        triggerType: "button",
        conversationSummary:
          "Student compared expected and actual output, then corrected the prompt.",
        workSummary: "Student produced a README and screenshot.",
        artifacts: [
          {
            kind: "doc",
            label: "README",
            url: "https://example.com/readme"
          }
        ],
        selfReflection: "I learned to tell the agent what success looks like.",
        agentEvaluationHints: ["one correction loop"],
        timestamp: "2026-06-29T12:00:00.000Z"
      });

    expect(response.status).toBe(201);
    expect(response.body.submission).toMatchObject({
      id: expect.any(String),
      studentId: "student-1",
      courseWorldId: "course-world-1",
      dayId: "day-1",
      agentSessionId: "session-1",
      triggerType: "button",
      artifacts: [
        {
          kind: "doc",
          label: "README",
          url: "https://example.com/readme"
        }
      ],
      agentEvaluationHints: ["one correction loop"],
      timestamp: "2026-06-29T12:00:00.000Z"
    });
    expect(response.body.review).toEqual({
      submissionId: response.body.submission.id,
      suggestedScore: 85,
      finalScore: 85,
      decision: "approve",
      rationale: "Clear goal, evidence of correction, and visible artifact.",
      riskFlags: []
    });
    expect(response.body.queue).toEqual({
      jobId: `review-${response.body.submission.id}`,
      status: "queued"
    });

    const persistedSubmission = await prisma.agentSubmission.findUniqueOrThrow({
      where: { id: response.body.submission.id },
      include: { reviewResult: true }
    });

    expect(persistedSubmission.studentId).toBe("student-1");
    expect(persistedSubmission.courseWorldId).toBe("course-world-1");
    expect(persistedSubmission.agentSessionId).toBe("session-1");
    expect(persistedSubmission.submittedAt.toISOString()).toBe(
      "2026-06-29T12:00:00.000Z"
    );
    expect(persistedSubmission.artifacts).toEqual([
      {
        kind: "doc",
        label: "README",
        url: "https://example.com/readme"
      }
    ]);
    expect(persistedSubmission.agentEvaluationHints).toEqual([
      "one correction loop"
    ]);
    expect(persistedSubmission.reviewResult).toMatchObject({
      suggestedScore: 85,
      finalScore: 85,
      decision: "approve",
      rationale: "Clear goal, evidence of correction, and visible artifact."
    });
  });

  it("records a teacher review decision", async () => {
    const submissionResponse = await request(app.getHttpServer())
      .post("/submissions")
      .send({
        studentId: "student-1",
        courseWorldId: "course-world-1",
        dayId: "day-1",
        agentSessionId: "session-1",
        triggerType: "button",
        conversationSummary:
          "Student compared expected and actual output, then corrected the prompt.",
        workSummary: "Student produced a README and screenshot.",
        artifacts: [
          {
            kind: "doc",
            label: "README",
            url: "https://example.com/readme"
          }
        ],
        selfReflection: "I learned to tell the agent what success looks like.",
        agentEvaluationHints: ["one correction loop"],
        timestamp: "2026-06-29T12:00:00.000Z"
      });

    const response = await request(app.getHttpServer())
      .post("/reviews/decide")
      .send({
        submissionId: submissionResponse.body.submission.id,
        finalScore: 90,
        decision: "adjust"
      });

    expect(response.status).toBe(201);
    expect(response.body).toEqual({
      submissionId: submissionResponse.body.submission.id,
      finalScore: 90,
      decision: "adjust"
    });

    const persistedReview = await prisma.reviewResult.findUniqueOrThrow({
      where: { submissionId: submissionResponse.body.submission.id }
    });

    expect(persistedReview.finalScore).toBe(90);
    expect(persistedReview.decision).toBe("adjust");
  });

  it("returns a teacher review list with summary and latest-first items", async () => {
    await prisma.agentSession.create({
      data: {
        id: "session-2",
        studentId: "student-2",
        provider: "claude-code",
        status: AgentSessionStatus.active
      }
    });

    const firstSubmission = await request(app.getHttpServer())
      .post("/submissions")
      .send({
        studentId: "student-1",
        courseWorldId: "course-world-1",
        dayId: "day-1",
        agentSessionId: "session-1",
        triggerType: "button",
        conversationSummary:
          "Student compared expected and actual output, then corrected the prompt.",
        workSummary: "Student produced a README and screenshot.",
        artifacts: [
          {
            kind: "doc",
            label: "README",
            url: "https://example.com/readme"
          }
        ],
        selfReflection: "I learned to tell the agent what success looks like.",
        agentEvaluationHints: ["one correction loop"],
        timestamp: "2026-06-29T08:00:00.000Z"
      });

    const secondSubmission = await request(app.getHttpServer())
      .post("/submissions")
      .send({
        studentId: "student-2",
        courseWorldId: "course-world-1",
        dayId: "day-2",
        agentSessionId: "session-2",
        triggerType: "button",
        conversationSummary:
          "Student prepared a peer review checklist and updated the prompt.",
        workSummary: "Student submitted notes for the next review round.",
        artifacts: [
          {
            kind: "doc",
            label: "Notes",
            url: "https://example.com/notes"
          }
        ],
        selfReflection: "I can now explain why the second draft is better.",
        agentEvaluationHints: ["peer review prep"],
        timestamp: "2026-06-29T09:00:00.000Z"
      });

    await request(app.getHttpServer())
      .post("/reviews/decide")
      .send({
        submissionId: secondSubmission.body.submission.id,
        finalScore: 90,
        decision: "adjust"
      });

    const response = await request(app.getHttpServer()).get("/reviews");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      summary: {
        pendingCount: 1,
        reviewedToday: 1,
        flaggedCount: 1
      },
      items: [
        {
          submissionId: secondSubmission.body.submission.id,
          studentName: "Mo",
          guildName: "Morning Forge",
          suggestedScore: 85,
          finalScore: 90,
          decision: "adjust",
          rationale: "Clear goal, evidence of correction, and visible artifact.",
          dayLabel: "Day 2",
          submittedAt: "2026-06-29T09:00:00.000Z"
        },
        {
          submissionId: firstSubmission.body.submission.id,
          studentName: "Lin",
          guildName: "Morning Forge",
          suggestedScore: 85,
          finalScore: 85,
          decision: "approve",
          rationale: "Clear goal, evidence of correction, and visible artifact.",
          dayLabel: "Day 1",
          submittedAt: "2026-06-29T08:00:00.000Z"
        }
      ]
    });
  });
});
