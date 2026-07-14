import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { PrismaClient } from "@prisma/client";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { seedDatabase } from "../prisma/seed";
import { AppModule } from "../src/app.module";
import { prepareTestDatabase } from "./support/test-database";

describe("chat access", () => {
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

  beforeAll(async () => {
    prisma = await prepareTestDatabase("chat-access");

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule]
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  beforeEach(async () => {
    await seedDatabase(prisma);
    // The seed grants student-2 access for the world snapshot. Access tests
    // start from a no-grant state so the unauthorized case is meaningful.
    await prisma.roomAccessGrant.deleteMany();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }

    if (prisma) {
      await prisma.$disconnect();
    }
  });

  it("allows a teacher to read-only enter a student chat room with viewerRole teacher", async () => {
    const teacherToken = await loginAs("teacher@academy.test", "teacher-pass-123");

    const response = await request(app.getHttpServer())
      .get("/chat?roomId=room-chat-student-1")
      .set("Authorization", `Bearer ${teacherToken}`);

    expect(response.status).toBe(200);
    expect(response.body.viewerRole).toBe("teacher");
    expect(response.body.roomId).toBe("room-chat-student-1");
    expect(response.body.studentId).toBe("student-1");
    expect(Array.isArray(response.body.messages)).toBe(true);
  });

  it("rejects a teacher requesting chat overview without a room ID", async () => {
    const teacherToken = await loginAs("teacher@academy.test", "teacher-pass-123");

    const response = await request(app.getHttpServer())
      .get("/chat")
      .set("Authorization", `Bearer ${teacherToken}`);

    expect(response.status).toBe(200);
    expect(response.body.rooms).toHaveLength(3);
  });

  it("forbids a teacher from posting chat messages", async () => {
    const teacherToken = await loginAs("teacher@academy.test", "teacher-pass-123");

    const response = await request(app.getHttpServer())
      .post("/chat/messages")
      .set("Authorization", `Bearer ${teacherToken}`)
      .send({
        roomId: "room-chat-student-1",
        body: "teacher should not post"
      });

    expect(response.status).toBe(403);
  });

  it("still returns owner viewerRole for a student accessing their own room", async () => {
    const studentToken = await loginAs("lin@academy.test", "student-pass-123");

    const response = await request(app.getHttpServer())
      .get("/chat?roomId=room-chat-student-1")
      .set("Authorization", `Bearer ${studentToken}`);

    expect(response.status).toBe(200);
    expect(response.body.viewerRole).toBe("owner");
  });

  it("still forbids a student from accessing another student's room without a grant", async () => {
    const outsiderToken = await loginAs("mo@academy.test", "student-pass-456");

    const response = await request(app.getHttpServer())
      .get("/chat?roomId=room-chat-student-1")
      .set("Authorization", `Bearer ${outsiderToken}`);

    expect(response.status).toBe(403);
  });

  it("forbids a teacher from creating a submission", async () => {
    const teacherToken = await loginAs("teacher@academy.test", "teacher-pass-123");

    const response = await request(app.getHttpServer())
      .post("/submissions")
      .set("Authorization", `Bearer ${teacherToken}`)
      .send({
        studentId: "teacher-1",
        courseWorldId: "course-world-1",
        dayId: "day-1",
        agentSessionId: "session-1",
        triggerType: "button",
        conversationSummary: "Teacher should not submit.",
        workSummary: "Should be rejected.",
        artifacts: [],
        selfReflection: "N/A",
        agentEvaluationHints: [],
        timestamp: "2026-06-29T12:00:00.000Z"
      });

    expect(response.status).toBe(403);
  });

  it("forbids a teacher from creating a room access grant", async () => {
    const teacherToken = await loginAs("teacher@academy.test", "teacher-pass-123");

    const response = await request(app.getHttpServer())
      .post("/rooms/access-grants")
      .set("Authorization", `Bearer ${teacherToken}`)
      .send({
        roomId: "room-chat-student-1",
        granteeId: "student-2",
        scope: "chat_summary",
        expiresInHours: 24
      });

    // Teachers are allowed to provision room grants for classroom support.
    expect(response.status).toBe(201);
  });

  it("forbids a teacher from accessing a non-student room", async () => {
    const teacherToken = await loginAs("teacher@academy.test", "teacher-pass-123");

    const response = await request(app.getHttpServer())
      .get("/chat?roomId=room-chat-teacher-1")
      .set("Authorization", `Bearer ${teacherToken}`);

    expect(response.status).toBe(403);
  });
});
