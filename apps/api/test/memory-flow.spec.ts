import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { PrismaClient } from "@prisma/client";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { seedDatabase } from "../prisma/seed";
import { AppModule } from "../src/app.module";
import { ReviewQueueService } from "../src/modules/queue/review.queue";
import { prepareTestDatabase } from "./support/test-database";

vi.mock("../src/modules/memory/llm/ark-adapter", () => ({
  isArkConfigured: () => false,
  scoreImportance: vi.fn(async () => 5.0),
  generateReflections: vi.fn(async () => []),
  chat: vi.fn(async () => ""),
  chatMultimodal: vi.fn(async () => "")
}));

import { generateReflections } from "../src/modules/memory/llm/ark-adapter";

describe("memory flow", () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  async function loginAsStudent() {
    const response = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email: "lin@academy.test", password: "student-pass-123" });
    expect(response.status).toBe(201);
    return response.body.token as string;
  }

  beforeAll(async () => {
    prisma = await prepareTestDatabase("memory-flow");

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

  it("records an observation memory via POST /agent-memory/observe", async () => {
    const token = await loginAsStudent();

    const response = await request(app.getHttpServer())
      .post("/agent-memory/observe")
      .set("Authorization", `Bearer ${token}`)
      .send({
        studentId: "student-1",
        type: "observation",
        content: "学生学习了如何使用 Agent 进行代码审查",
        importance: 8.0,
        courseWorldId: "course-world-1",
        roomId: "room-student-1",
        agentSessionId: "session-1",
        taskId: "task-code-review"
      });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      id: expect.any(String),
      studentId: "student-1",
      type: "observation",
      content: "学生学习了如何使用 Agent 进行代码审查",
      importance: 8.0,
      courseWorldId: "course-world-1",
      roomId: "room-student-1",
      agentSessionId: "session-1",
      taskId: "task-code-review",
      createdAt: expect.any(String),
      lastAccessedAt: expect.any(String)
    });

    const persisted = await prisma.agentMemory.findUniqueOrThrow({
      where: { id: response.body.id }
    });
    expect(persisted.studentId).toBe("student-1");
    expect(persisted.type).toBe("observation");
    expect(persisted.content).toBe("学生学习了如何使用 Agent 进行代码审查");
    expect(persisted.importance).toBe(8.0);
    expect(persisted.courseWorldId).toBe("course-world-1");
    expect(persisted.roomId).toBe("room-student-1");
    expect(persisted.agentSessionId).toBe("session-1");
    expect(persisted.taskId).toBe("task-code-review");
  });

  it("retrieves only memories matching every provided scope", async () => {
    const token = await loginAsStudent();

    await prisma.agentMemory.createMany({
      data: [
        {
          studentId: "student-1",
          type: "observation",
          content: "当前任务的 scoped memory",
          importance: 6,
          courseWorldId: "course-world-1",
          roomId: "room-student-1",
          agentSessionId: "session-1",
          taskId: "task-current"
        },
        {
          studentId: "student-1",
          type: "observation",
          content: "同一房间但不同任务",
          importance: 10,
          courseWorldId: "course-world-1",
          roomId: "room-student-1",
          agentSessionId: "session-1",
          taskId: "task-other"
        },
        {
          studentId: "student-1",
          type: "observation",
          content: "没有 scope 的旧记忆",
          importance: 10
        }
      ]
    });

    const response = await request(app.getHttpServer())
      .get("/agent-memory/retrieve")
      .set("Authorization", `Bearer ${token}`)
      .query({
        studentId: "student-1",
        query: "memory",
        courseWorldId: "course-world-1",
        roomId: "room-student-1",
        agentSessionId: "session-1",
        taskId: "task-current"
      });

    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(1);
    expect(response.body[0]).toMatchObject({
      content: "当前任务的 scoped memory",
      courseWorldId: "course-world-1",
      roomId: "room-student-1",
      agentSessionId: "session-1",
      taskId: "task-current"
    });
  });

  it("retrieves and sorts memories by combined score via GET /agent-memory/retrieve", async () => {
    const token = await loginAsStudent();

    // Create memories with different importance and content
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 1 * 60 * 60 * 1000);
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    await prisma.agentMemory.create({
      data: {
        studentId: "student-1",
        type: "observation",
        content: "学生学习了 prompt engineering 技巧",
        importance: 9.0,
        createdAt: oneHourAgo,
        lastAccessedAt: oneHourAgo
      }
    });

    await prisma.agentMemory.create({
      data: {
        studentId: "student-1",
        type: "observation",
        content: "学生参加了每日站会",
        importance: 2.0,
        createdAt: oneDayAgo,
        lastAccessedAt: oneDayAgo
      }
    });

    await prisma.agentMemory.create({
      data: {
        studentId: "student-1",
        type: "plan",
        content: "学生计划学习 prompt 设计",
        importance: 5.0,
        createdAt: now,
        lastAccessedAt: now
      }
    });

    const response = await request(app.getHttpServer())
      .get("/agent-memory/retrieve")
      .set("Authorization", `Bearer ${token}`)
      .query({ studentId: "student-1", query: "prompt", limit: 30 });

    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(3);

    // The memory with "prompt" in content and high importance should rank first
    const first = response.body[0];
    expect(first.content).toContain("prompt");

    // Verify scores are in descending order
    const scores = response.body.map((m: { score: number }) => m.score);
    for (let i = 0; i < scores.length - 1; i++) {
      expect(scores[i]).toBeGreaterThanOrEqual(scores[i + 1]);
    }
  });

  it("generates reflections when cumulative importance exceeds threshold", async () => {
    const token = await loginAsStudent();

    // Create observations with cumulative importance > 150
    for (let i = 0; i < 20; i++) {
      await prisma.agentMemory.create({
        data: {
          studentId: "student-1",
          type: "observation",
          content: `学习观察 #${i}: 学生在 Agent 编程中掌握了概念 ${i}`,
          importance: 9.0
        }
      });
    }

    // Mock LLM to return reflections
    vi.mocked(generateReflections).mockResolvedValueOnce([
      "学生通过反复实践掌握了 Agent 编程的核心概念",
      "学生在迭代优化中展现出系统性思维",
      "学生开始关注代码质量和测试覆盖率",
      "学生能独立完成复杂调试任务",
      "学生对架构设计有了初步理解"
    ]);

    const response = await request(app.getHttpServer())
      .post("/agent-memory/reflect")
      .set("Authorization", `Bearer ${token}`)
      .send({ studentId: "student-1" });

    expect(response.status).toBe(201);
    expect(response.body.insights).toHaveLength(5);
    expect(response.body.insights[0]).toContain("学生");

    // Verify reflection memories were persisted
    const reflections = await prisma.agentMemory.findMany({
      where: { studentId: "student-1", type: "reflection" }
    });
    expect(reflections).toHaveLength(5);
    expect(reflections[0].content).toContain("学生");
  });

  it("returns empty insights when cumulative importance is below threshold", async () => {
    const token = await loginAsStudent();

    await prisma.agentMemory.create({
      data: {
        studentId: "student-1",
        type: "observation",
        content: "学生完成了一个小练习",
        importance: 5.0
      }
    });

    const response = await request(app.getHttpServer())
      .post("/agent-memory/reflect")
      .set("Authorization", `Bearer ${token}`)
      .send({ studentId: "student-1" });

    expect(response.status).toBe(201);
    expect(response.body.insights).toEqual([]);
  });

  it("rejects observe without auth", async () => {
    const response = await request(app.getHttpServer())
      .post("/agent-memory/observe")
      .send({
        studentId: "student-1",
        type: "observation",
        content: "test"
      });

    expect(response.status).toBe(401);
  });

  it("rejects retrieve when studentId does not match session", async () => {
    const token = await loginAsStudent();

    const response = await request(app.getHttpServer())
      .get("/agent-memory/retrieve")
      .set("Authorization", `Bearer ${token}`)
      .query({ studentId: "student-2", query: "test" });

    expect(response.status).toBe(403);
  });
});
