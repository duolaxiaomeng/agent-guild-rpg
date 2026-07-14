import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { PrismaClient } from "@prisma/client";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { teacherTaskSchema } from "contracts";
import { AppModule } from "../src/app.module";
import { prepareTestDatabase } from "./support/test-database";

describe("teacher task flow", () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  async function login(email: string, password: string) {
    const response = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email, password });

    expect(response.status).toBe(201);
    return response.body.token as string;
  }

  beforeAll(async () => {
    prisma = await prepareTestDatabase("teacher-task-flow");

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule]
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true
      })
    );
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  it("lets only a teacher publish a daily homework task", async () => {
    const [teacherToken, studentToken] = await Promise.all([
      login("teacher@academy.test", "teacher-pass-123"),
      login("lin@academy.test", "student-pass-123")
    ]);
    const homework = {
      courseWorldId: "course-world-1",
      dayId: "day-3",
      title: "Agent 可靠性检查",
      status: "open",
      description: "为 Agent 工作流补齐错误处理和验证证据。",
      homework: "完成一次失败重试并提交测试输出。",
      acceptanceCriteria: [
        "请求失败时记录可定位的错误日志",
        "至少完成一次自动重试并保留测试证据"
      ],
      dueAt: "2026-07-17T10:00:00.000Z",
      publishedAt: "2026-07-14T06:00:00.000Z"
    };

    const forbidden = await request(app.getHttpServer())
      .post("/quests")
      .set("Authorization", `Bearer ${studentToken}`)
      .send(homework);

    expect(forbidden.status).toBe(403);

    const created = await request(app.getHttpServer())
      .post("/quests")
      .set("Authorization", `Bearer ${teacherToken}`)
      .send(homework);

    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({
      id: "day-3",
      ...homework,
      teacherId: "teacher-1"
    });
    expect(() => teacherTaskSchema.parse(created.body)).not.toThrow();

    const persisted = await prisma.questDay.findUnique({
      where: { id: "day-3" }
    });
    expect(persisted).toMatchObject({
      id: "day-3",
      teacherId: "teacher-1",
      description: homework.description,
      homework: homework.homework
    });
    expect(persisted?.acceptanceCriteria).toEqual(homework.acceptanceCriteria);
  });

  it("keeps legacy quest fields while returning the expanded homework model", async () => {
    const studentToken = await login("lin@academy.test", "student-pass-123");
    const response = await request(app.getHttpServer())
      .get("/quests")
      .set("Authorization", `Bearer ${studentToken}`);

    expect(response.status).toBe(200);
    expect(response.body[0]).toMatchObject({
      id: "day-1",
      dayId: "day-1",
      courseWorldId: "course-world-1",
      title: expect.any(String),
      status: "open",
      description: expect.any(String),
      homework: expect.any(String),
      acceptanceCriteria: expect.any(Array),
      dueAt: expect.any(String),
      publishedAt: expect.any(String),
      teacherId: "teacher-1"
    });
    expect(() => teacherTaskSchema.parse(response.body[0])).not.toThrow();
  });

  it("returns teacher-only task progress from submissions and review state", async () => {
    const [teacherToken, studentToken] = await Promise.all([
      login("teacher@academy.test", "teacher-pass-123"),
      login("lin@academy.test", "student-pass-123")
    ]);

    const forbidden = await request(app.getHttpServer())
      .get("/quests/progress")
      .set("Authorization", `Bearer ${studentToken}`);
    expect(forbidden.status).toBe(403);

    const response = await request(app.getHttpServer())
      .get("/quests/progress")
      .set("Authorization", `Bearer ${teacherToken}`);

    expect(response.status).toBe(200);
    const dayOne = response.body.find(
      (task: { dayId: string }) => task.dayId === "day-1"
    );
    expect(dayOne.summary).toEqual({
      total: 3,
      notStarted: 0,
      submitted: 1,
      reviewed: 2
    });
    expect(dayOne.students).toEqual([
      expect.objectContaining({
        studentId: "student-1",
        displayName: "Lin",
        status: "reviewed",
        submissionId: "sub-1",
        reviewedAt: expect.any(String)
      }),
      expect.objectContaining({
        studentId: "student-2",
        displayName: "Mo",
        status: "reviewed",
        submissionId: "sub-2",
        reviewedAt: expect.any(String)
      }),
      expect.objectContaining({
        studentId: "student-3",
        displayName: "Kai",
        status: "submitted",
        submissionId: "sub-3",
        reviewedAt: null
      })
    ]);

    const dayTwo = response.body.find(
      (task: { dayId: string }) => task.dayId === "day-2"
    );
    expect(dayTwo.summary).toEqual({
      total: 3,
      notStarted: 3,
      submitted: 0,
      reviewed: 0
    });
    expect(dayTwo.students.every(
      (student: { status: string }) => student.status === "not_started"
    )).toBe(true);
  });
});
