import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { PrismaClient } from "@prisma/client";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";
import { prepareTestDatabase } from "./support/test-database";

describe("auth flow", () => {
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
    prisma = await prepareTestDatabase("auth-flow");

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule]
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }

    if (prisma) {
      await prisma.$disconnect();
    }
  });

  it("logs in a seeded teacher and returns a session token", async () => {
    const response = await request(app.getHttpServer()).post("/auth/login").send({
      email: "teacher@academy.test",
      password: "teacher-pass-123"
    });

    expect(response.status).toBe(201);
    expect(response.body.user.role).toBe("teacher");
    expect(response.body.token).toMatch(/^session_/);
  });

  it("registers a student with the internal code and creates their world identity", async () => {
    const rejected = await request(app.getHttpServer()).post("/auth/register").send({
      displayName: "新同学",
      email: "new@academy.test",
      password: "student-pass-123",
      registrationCode: "wrong-code"
    });
    expect(rejected.status).toBe(403);

    const created = await request(app.getHttpServer()).post("/auth/register").send({
      displayName: "新同学",
      email: "new@academy.test",
      password: "student-pass-123",
      registrationCode: "chuangshuo_agent_one"
    });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({
      token: expect.stringMatching(/^session_/),
      user: { role: "student", displayName: "新同学" }
    });

    const user = await prisma.user.findUnique({
      where: { email: "new@academy.test" },
      include: { homestead: { include: { rooms: true } } }
    });
    expect(user?.homestead?.rooms).toEqual([
      expect.objectContaining({
        id: `room-chat-${user?.id}`,
        name: "新同学 的聊天室",
        type: "chat_room"
      })
    ]);
  });

  it("reads the current session for a logged-in teacher", async () => {
    const loginResponse = await request(app.getHttpServer()).post("/auth/login").send({
      email: "teacher@academy.test",
      password: "teacher-pass-123"
    });

    const sessionResponse = await request(app.getHttpServer())
      .get("/auth/session")
      .set("Authorization", `Bearer ${loginResponse.body.token}`);

    expect(sessionResponse.status).toBe(200);
    expect(sessionResponse.body).toMatchObject({
      token: loginResponse.body.token,
      user: {
        id: "teacher-1",
        role: "teacher",
        displayName: "Teacher Lin"
      }
    });
  });

  it("accepts the HttpOnly session cookie when no bearer header is present", async () => {
    const token = await loginAs("teacher@academy.test", "teacher-pass-123");

    const response = await request(app.getHttpServer())
      .get("/auth/session")
      .set("Cookie", `agent-guild-session-token=${encodeURIComponent(token)}`);

    expect(response.status).toBe(200);
    expect(response.body.user.id).toBe("teacher-1");
  });

  it("rejects anonymous access to the teacher review queue", async () => {
    const response = await request(app.getHttpServer()).get("/reviews");

    expect(response.status).toBe(401);
  });

  it("rejects student access to the teacher review queue", async () => {
    const studentToken = await loginAs("lin@academy.test", "student-pass-123");

    const response = await request(app.getHttpServer())
      .get("/reviews")
      .set("Authorization", `Bearer ${studentToken}`);

    expect(response.status).toBe(403);
  });

  it("lets a student read only their own chat overview", async () => {
    const studentToken = await loginAs("lin@academy.test", "student-pass-123");

    const ownChatResponse = await request(app.getHttpServer())
      .get("/chat")
      .set("Authorization", `Bearer ${studentToken}`);
    const otherChatResponse = await request(app.getHttpServer())
      .get("/chat?studentId=student-2")
      .set("Authorization", `Bearer ${studentToken}`);

    expect(ownChatResponse.status).toBe(200);
    expect(ownChatResponse.body.studentId).toBe("student-1");
    expect(otherChatResponse.status).toBe(403);
  });
});
