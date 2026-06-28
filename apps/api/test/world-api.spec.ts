import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { PrismaClient, QuestStatus } from "@prisma/client";
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
      .send({ email: "teacher@example.com" });

    const studentResponse = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email: "lin@example.com" });

    expect(teacherResponse.status).toBe(201);
    expect(teacherResponse.body).toMatchObject({
      token: expect.any(String),
      user: {
        role: "teacher",
        displayName: "teacher"
      }
    });
    expect(studentResponse.status).toBe(201);
    expect(studentResponse.body.user.role).toBe("student");
    expect(studentResponse.body.user.displayName).toBe("lin");
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
});
