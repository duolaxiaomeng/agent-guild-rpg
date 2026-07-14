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
  chatMultimodal: vi.fn(async () => ""),
}));

describe("learning insights", () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  async function loginAsStudent() {
    const response = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email: "lin@academy.test", password: "student-pass-123" });
    expect(response.status).toBe(201);
    return response.body.token as string;
  }

  async function loginAsTeacher() {
    const response = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email: "teacher@academy.test", password: "teacher-pass-123" });
    expect(response.status).toBe(201);
    return response.body.token as string;
  }

  beforeAll(async () => {
    prisma = await prepareTestDatabase("learning-insight");

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(ReviewQueueService)
      .useValue({
        enqueue: async (submissionId: string) => ({
          jobId: `review-${submissionId}`,
          status: "queued" as const,
        }),
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

  describe("GET /learning-insights/student/:studentId", () => {
    it("returns rule-based insights for a student (degraded mode)", async () => {
      const token = await loginAsStudent();

      // Seed some memories for the student
      await prisma.agentMemory.create({
        data: {
          studentId: "student-1",
          type: "reflection",
          content: "学生通过反复实践掌握了 Agent 编程的核心概念",
          importance: 8.0,
        },
      });

      for (let i = 0; i < 10; i++) {
        await prisma.agentMemory.create({
          data: {
            studentId: "student-1",
            type: "observation",
            content: `学习观察 #${i}: 学生在 Agent 编程中掌握了概念 ${i}`,
            importance: 7.0,
          },
        });
      }

      const response = await request(app.getHttpServer())
        .get("/learning-insights/student/student-1")
        .set("Authorization", `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("strengths");
      expect(response.body).toHaveProperty("weaknesses");
      expect(response.body).toHaveProperty("recommendations");
      expect(response.body).toHaveProperty("nextQuestSuggestion");
      expect(Array.isArray(response.body.strengths)).toBe(true);
      expect(Array.isArray(response.body.weaknesses)).toBe(true);
      expect(Array.isArray(response.body.recommendations)).toBe(true);
      expect(typeof response.body.nextQuestSuggestion).toBe("string");
      // With reflections and high importance, strengths should not be empty
      expect(response.body.strengths.length).toBeGreaterThan(0);
    });

    it("returns rule-based insights with minimal data", async () => {
      const token = await loginAsStudent();

      // No memories seeded — should still return valid structure
      const response = await request(app.getHttpServer())
        .get("/learning-insights/student/student-1")
        .set("Authorization", `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.strengths).toHaveLength(1);
      expect(response.body.strengths[0]).toBe("学习活动已启动");
      expect(response.body.nextQuestSuggestion).toContain("Day1");
    });

    it("rejects access without auth", async () => {
      const response = await request(app.getHttpServer()).get(
        "/learning-insights/student/student-1",
      );

      expect(response.status).toBe(401);
    });

    it("rejects student viewing another student's insights", async () => {
      const token = await loginAsStudent();

      const response = await request(app.getHttpServer())
        .get("/learning-insights/student/student-2")
        .set("Authorization", `Bearer ${token}`);

      expect(response.status).toBe(403);
    });

    it("allows teacher to view any student's insights", async () => {
      const token = await loginAsTeacher();

      const response = await request(app.getHttpServer())
        .get("/learning-insights/student/student-1")
        .set("Authorization", `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("strengths");
    });
  });

  describe("GET /learning-insights/class", () => {
    it("returns class-level insights for a teacher (degraded mode)", async () => {
      const token = await loginAsTeacher();

      // Seed some student data
      await prisma.agentMemory.create({
        data: {
          studentId: "student-1",
          type: "reflection",
          content: "学生1掌握了Agent调试",
          importance: 8.0,
        },
      });

      await prisma.agentMemory.create({
        data: {
          studentId: "student-2",
          type: "observation",
          content: "学生2参加了练习",
          importance: 3.0,
        },
      });

      const response = await request(app.getHttpServer())
        .get("/learning-insights/class")
        .set("Authorization", `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("commonIssues");
      expect(response.body).toHaveProperty("topPerformers");
      expect(response.body).toHaveProperty("needsAttention");
      expect(response.body).toHaveProperty("classProgress");
      expect(Array.isArray(response.body.commonIssues)).toBe(true);
      expect(Array.isArray(response.body.topPerformers)).toBe(true);
      expect(Array.isArray(response.body.needsAttention)).toBe(true);
      expect(typeof response.body.classProgress).toBe("string");
      expect(response.body.classProgress).toContain("班级");
    });

    it("rejects student access to class insights", async () => {
      const token = await loginAsStudent();

      const response = await request(app.getHttpServer())
        .get("/learning-insights/class")
        .set("Authorization", `Bearer ${token}`);

      expect(response.status).toBe(403);
    });

    it("rejects access without auth", async () => {
      const response = await request(app.getHttpServer()).get(
        "/learning-insights/class",
      );

      expect(response.status).toBe(401);
    });

    it("rejects teacherId mismatch", async () => {
      const token = await loginAsTeacher();

      const response = await request(app.getHttpServer())
        .get("/learning-insights/class?teacherId=wrong-id")
        .set("Authorization", `Bearer ${token}`);

      expect(response.status).toBe(403);
    });
  });
});
