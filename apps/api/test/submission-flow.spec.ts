import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { PrismaClient } from "@prisma/client";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";
import { prepareTestDatabase } from "./support/test-database";

describe("submission flow", () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = await prepareTestDatabase("submission-flow");

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
    expect(response.body).toEqual({
      id: "grant-1",
      roomId: "room-1",
      granteeId: "11111111-1111-4111-8111-111111111111",
      status: "approved",
      scope: "chat_summary"
    });
  });

  it("accepts a student submission and returns a suggested review", async () => {
    const response = await request(app.getHttpServer())
      .post("/submissions")
      .send({
        studentId: "11111111-1111-4111-8111-111111111111",
        courseWorldId: "22222222-2222-4222-8222-222222222222",
        dayId: "day-1",
        agentSessionId: "33333333-3333-4333-8333-333333333333",
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
      id: "submission-1",
      studentId: "11111111-1111-4111-8111-111111111111",
      dayId: "day-1"
    });
    expect(response.body.review).toEqual({
      submissionId: "submission-1",
      suggestedScore: 85,
      finalScore: 85,
      decision: "approve",
      rationale: "Clear goal, evidence of correction, and visible artifact.",
      riskFlags: []
    });
    expect(response.body.queue).toEqual({
      jobId: "review-submission-1",
      status: "queued"
    });
  });

  it("records a teacher review decision", async () => {
    const response = await request(app.getHttpServer())
      .post("/reviews/decide")
      .send({
        submissionId: "submission-1",
        finalScore: 90,
        decision: "adjust"
      });

    expect(response.status).toBe(201);
    expect(response.body).toEqual({
      submissionId: "submission-1",
      finalScore: 90,
      decision: "adjust"
    });
  });
});
