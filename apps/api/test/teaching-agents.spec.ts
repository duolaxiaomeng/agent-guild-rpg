import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { AgentConnectorStatus, PrismaClient } from "@prisma/client";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { seedDatabase } from "../prisma/seed";
import { AppModule } from "../src/app.module";
import { ReviewQueueService } from "../src/modules/queue/review.queue";
import { prepareTestDatabase } from "./support/test-database";

vi.mock("../src/modules/memory/llm/ark-adapter", () => ({
  isArkConfigured: vi.fn(() => false),
  scoreImportance: vi.fn(async () => 5.0),
  generateReflections: vi.fn(async () => []),
  chat: vi.fn(async () => ""),
  chatMultimodal: vi.fn(async () => ""),
}));

import { chat, isArkConfigured } from "../src/modules/memory/llm/ark-adapter";

describe("teaching agents", () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let cachedStudentToken: string | undefined;
  let cachedTeacherToken: string | undefined;

  async function loginAsStudent() {
    if (cachedStudentToken) return cachedStudentToken;
    const response = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email: "lin@academy.test", password: "student-pass-123" });
    expect(response.status).toBe(201);
    cachedStudentToken = response.body.token as string;
    return cachedStudentToken;
  }

  async function loginAsTeacher() {
    if (cachedTeacherToken) return cachedTeacherToken;
    const response = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email: "teacher@academy.test", password: "teacher-pass-123" });
    expect(response.status).toBe(201);
    cachedTeacherToken = response.body.token as string;
    return cachedTeacherToken;
  }

  beforeAll(async () => {
    prisma = await prepareTestDatabase("teaching-agents");
    await prisma.agentConnector.upsert({
      where: { agentSessionId: "session-1" },
      create: {
        id: "connector-teaching-agents",
        studentId: "student-1",
        agentSessionId: "session-1",
        provider: "claude-code",
        clientName: "teaching-agents-test",
        tokenHash: "teaching-agents-test-token",
        status: AgentConnectorStatus.online,
        capabilities: [],
        lastSeenAt: new Date(),
      },
      update: {
        status: AgentConnectorStatus.online,
        lastSeenAt: new Date(),
      },
    });

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
    // Preserve the cached login sessions to avoid tripping the login throttle;
    // reset only the mutable SOP data between tests.
    await prisma.reviewResult.deleteMany();
    await prisma.agentSubmission.deleteMany();
    await prisma.agentMemory.deleteMany();
    await prisma.agentEvent.deleteMany();
    // Reset mocks to default (degraded mode)
    vi.mocked(isArkConfigured).mockReturnValue(false);
    vi.mocked(chat).mockResolvedValue("");
    // Wait for any pending async operations from previous tests
    // (e.g. async SOP triggers from submission creation)
    await new Promise((resolve) => setTimeout(resolve, 50));
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  /* ---------------------------------------------------------------- */
  /*  GET /teaching-agents/sop-types                                  */
  /* ---------------------------------------------------------------- */

  describe("GET /teaching-agents/sop-types", () => {
    it("returns the list of available SOP types", async () => {
      const token = await loginAsStudent();

      const response = await request(app.getHttpServer())
        .get("/teaching-agents/sop-types")
        .set("Authorization", `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body).toHaveLength(3);

      const types = response.body.map(
        (item: { type: string }) => item.type,
      );
      expect(types).toContain("submission-review");
      expect(types).toContain("student-question");
      expect(types).toContain("quest-completion");

      // Each item should have metadata
      for (const item of response.body) {
        expect(item).toHaveProperty("label");
        expect(item).toHaveProperty("description");
        expect(item).toHaveProperty("steps");
        expect(Array.isArray(item.steps)).toBe(true);
        expect(item.steps.length).toBeGreaterThan(0);
      }
    });

    it("rejects access without auth", async () => {
      const response = await request(app.getHttpServer()).get(
        "/teaching-agents/sop-types",
      );
      expect(response.status).toBe(401);
    });
  });

  /* ---------------------------------------------------------------- */
  /*  POST /teaching-agents/question (degraded mode)                  */
  /* ---------------------------------------------------------------- */

  describe("POST /teaching-agents/question (degraded)", () => {
    it("runs the student-question SOP in degraded mode", async () => {
      const token = await loginAsStudent();

      const response = await request(app.getHttpServer())
        .post("/teaching-agents/question")
        .set("Authorization", `Bearer ${token}`)
        .send({ studentId: "student-1", question: "什么是 Agent 编程？" });

      expect(response.status).toBe(201);
      expect(response.body.sopType).toBe("student-question");
      expect(response.body.degraded).toBe(true);
      expect(Array.isArray(response.body.steps)).toBe(true);
      expect(response.body.steps).toHaveLength(3);
      expect(response.body.finalOutput).toContain("SOP 完成");
      expect(response.body.completedAt).toBeTruthy();

      // Step 1: TA agent
      expect(response.body.steps[0].agentRole).toBe("ta");
      expect(response.body.steps[0].agentName).toContain("助教");
      expect(response.body.steps[0].output).toContain("助教");

      // Step 2: Mentor agent
      expect(response.body.steps[1].agentRole).toBe("mentor");
      expect(response.body.steps[1].agentName).toContain("答疑");
      expect(response.body.steps[1].output).toContain("答疑");

      // Step 3: TA agent (summary)
      expect(response.body.steps[2].agentRole).toBe("ta");
      expect(response.body.steps[2].output).toContain("综合");
    });

    it("rejects access without auth", async () => {
      const response = await request(app.getHttpServer())
        .post("/teaching-agents/question")
        .send({ studentId: "student-1", question: "test" });

      expect(response.status).toBe(401);
    });

    it("handles missing question gracefully", async () => {
      const token = await loginAsStudent();

      const response = await request(app.getHttpServer())
        .post("/teaching-agents/question")
        .set("Authorization", `Bearer ${token}`)
        .send({ studentId: "student-1", question: "" });

      // Should still return 201 with a valid structure
      expect(response.status).toBe(201);
      expect(response.body.sopType).toBe("student-question");
    });
  });

  /* ---------------------------------------------------------------- */
  /*  POST /teaching-agents/question (LLM mode)                      */
  /* ---------------------------------------------------------------- */

  describe("POST /teaching-agents/question (LLM mode)", () => {
    it("uses LLM when ARK_API_KEY is set", async () => {
      vi.mocked(isArkConfigured).mockReturnValue(true);
      vi.mocked(chat)
        .mockResolvedValueOnce("助教初步解答: Agent编程是...")
        .mockResolvedValueOnce("答疑深度解析: 从原理来看...")
        .mockResolvedValueOnce("综合回答: 综上所述...");

      const token = await loginAsStudent();

      const response = await request(app.getHttpServer())
        .post("/teaching-agents/question")
        .set("Authorization", `Bearer ${token}`)
        .send({ studentId: "student-1", question: "什么是 Agent 编程？" });

      expect(response.status).toBe(201);
      expect(response.body.degraded).toBe(false);
      expect(response.body.steps).toHaveLength(3);
      expect(response.body.steps[0].output).toContain("助教初步解答");
      expect(response.body.steps[1].output).toContain("答疑深度解析");
      expect(response.body.steps[2].output).toContain("综合回答");

      // Verify LLM was called 3 times (cost control: max 3 calls)
      expect(vi.mocked(chat)).toHaveBeenCalledTimes(3);
    });

    it("falls back to rule-based when LLM call throws", async () => {
      vi.mocked(isArkConfigured).mockReturnValue(true);
      vi.mocked(chat).mockRejectedValue(new Error("LLM unavailable"));

      const token = await loginAsStudent();

      const response = await request(app.getHttpServer())
        .post("/teaching-agents/question")
        .set("Authorization", `Bearer ${token}`)
        .send({ studentId: "student-1", question: "测试问题" });

      expect(response.status).toBe(201);
      // Should still return valid result with fallback content
      expect(response.body.steps).toHaveLength(3);
      expect(response.body.steps[0].output).toContain("助教");
    });
  });

  /* ---------------------------------------------------------------- */
  /*  POST /teaching-agents/review (degraded mode)                   */
  /* ---------------------------------------------------------------- */

  describe("POST /teaching-agents/review (degraded)", () => {
    it("runs the submission-review SOP for an existing submission", async () => {
      const token = await loginAsStudent();

      // Create a submission first
      const submissionResponse = await request(app.getHttpServer())
        .post("/submissions")
        .set("Authorization", `Bearer ${token}`)
        .send({
          clientRequestId: `teaching-agents-${Date.now()}`,
          studentId: "student-1",
          courseWorldId: "course-world-1",
          dayId: "day-1",
          agentSessionId: "session-1",
          triggerType: "button",
          conversationSummary: "与 Agent 讨论了编程基础概念和实践方法",
          workSummary: "完成了 Agent 编程入门练习，编写了基础对话逻辑",
          artifacts: [
            {
              kind: "repo",
              label: "agent-demo",
              url: "https://github.com/example/agent-demo",
            },
          ],
          selfReflection: "通过这次练习我理解了 Agent 的基本工作原理",
          agentEvaluationHints: ["代码结构清晰", "需要更多注释"],
          timestamp: new Date().toISOString(),
        });

      expect(submissionResponse.status).toBe(201);
      const submissionId = submissionResponse.body.submission.id;

      // Run the review SOP
      const response = await request(app.getHttpServer())
        .post("/teaching-agents/review")
        .set("Authorization", `Bearer ${token}`)
        .send({ submissionId });

      expect(response.status).toBe(201);
      expect(response.body.sopType).toBe("submission-review");
      expect(response.body.degraded).toBe(true);
      expect(response.body.steps).toHaveLength(3);

      // Step 1: Reviewer agent
      expect(response.body.steps[0].agentRole).toBe("reviewer");
      expect(response.body.steps[0].agentName).toContain("评审");
      expect(response.body.steps[0].output).toContain("评审");

      // Step 2: TA agent
      expect(response.body.steps[1].agentRole).toBe("ta");
      expect(response.body.steps[1].agentName).toContain("助教");

      // Step 3: Reviewer agent (final report)
      expect(response.body.steps[2].agentRole).toBe("reviewer");
      expect(response.body.steps[2].output).toContain("最终评审报告");

      expect(response.body.finalOutput).toContain("SOP 完成");
    });

    it("handles non-existent submission gracefully", async () => {
      const token = await loginAsStudent();

      const response = await request(app.getHttpServer())
        .post("/teaching-agents/review")
        .set("Authorization", `Bearer ${token}`)
        .send({ submissionId: "non-existent-id" });

      expect(response.status).toBe(201);
      expect(response.body.finalOutput).toContain("不存在");
      expect(response.body.steps).toHaveLength(0);
      expect(response.body.degraded).toBe(true);
    });
  });

  /* ---------------------------------------------------------------- */
  /*  POST /teaching-agents/quest-complete (degraded mode)            */
  /* ---------------------------------------------------------------- */

  describe("POST /teaching-agents/quest-complete (degraded)", () => {
    it("runs the quest-completion SOP", async () => {
      const token = await loginAsStudent();

      const response = await request(app.getHttpServer())
        .post("/teaching-agents/quest-complete")
        .set("Authorization", `Bearer ${token}`)
        .send({ studentId: "student-1", questId: "day-1" });

      expect(response.status).toBe(201);
      expect(response.body.sopType).toBe("quest-completion");
      expect(response.body.degraded).toBe(true);
      expect(response.body.steps).toHaveLength(3);

      // Step 1: Reviewer agent (validation)
      expect(response.body.steps[0].agentRole).toBe("reviewer");
      expect(response.body.steps[0].output).toContain("验证");

      // Step 2: TA agent (summary)
      expect(response.body.steps[1].agentRole).toBe("ta");
      expect(response.body.steps[1].output).toContain("总结");

      // Step 3: Reviewer agent (final report)
      expect(response.body.steps[2].agentRole).toBe("reviewer");
      expect(response.body.steps[2].output).toContain("关卡完成报告");

      expect(response.body.finalOutput).toContain("SOP 完成");
    });
  });

  /* ---------------------------------------------------------------- */
  /*  POST /teaching-agents/collaborate                               */
  /* ---------------------------------------------------------------- */

  describe("POST /teaching-agents/collaborate", () => {
    it("runs multi-agent collaboration in degraded mode", async () => {
      const token = await loginAsTeacher();

      const response = await request(app.getHttpServer())
        .post("/teaching-agents/collaborate")
        .set("Authorization", `Bearer ${token}`)
        .send({
          agents: ["ta", "reviewer", "mentor"],
          topic: "如何提高 Agent 编程能力",
        });

      expect(response.status).toBe(201);
      expect(response.body.degraded).toBe(true);
      expect(response.body.topic).toBe("如何提高 Agent 编程能力");
      expect(response.body.messages).toHaveLength(3);

      // Each agent should have spoken
      expect(response.body.messages[0].agentRole).toBe("ta");
      expect(response.body.messages[0].agentName).toContain("助教");
      expect(response.body.messages[0].message.length).toBeGreaterThan(0);

      expect(response.body.messages[1].agentRole).toBe("reviewer");
      expect(response.body.messages[1].agentName).toContain("评审");

      expect(response.body.messages[2].agentRole).toBe("mentor");
      expect(response.body.messages[2].agentName).toContain("答疑");

      // Summary should be generated
      expect(response.body.summary.length).toBeGreaterThan(0);
      expect(response.body.summary).toContain("如何提高 Agent 编程能力");
    });

    it("uses LLM when ARK_API_KEY is set", async () => {
      // Wait for any pending async operations from previous tests
      await new Promise((resolve) => setTimeout(resolve, 50));

      vi.mocked(isArkConfigured).mockReturnValue(true);
      // Fully reset chat mock to clear any leftover once-queue from prior tests
      vi.mocked(chat).mockReset();
      vi.mocked(chat).mockResolvedValue("");
      vi.mocked(chat)
        .mockResolvedValueOnce("助教观点: 多练习基础概念")
        .mockResolvedValueOnce("评审观点: 关注代码质量")
        .mockResolvedValueOnce("导师观点: 理解底层原理")
        .mockResolvedValueOnce("讨论总结: 综合三个方面的建议");

      const token = await loginAsTeacher();

      const response = await request(app.getHttpServer())
        .post("/teaching-agents/collaborate")
        .set("Authorization", `Bearer ${token}`)
        .send({
          agents: ["ta", "reviewer", "mentor"],
          topic: "Agent 编程学习路径",
        });

      expect(response.status).toBe(201);
      expect(response.body.degraded).toBe(false);
      expect(response.body.messages).toHaveLength(3);
      expect(response.body.messages[0].message).toContain("助教观点");
      expect(response.body.summary).toContain("讨论总结");

      // 4 calls: 3 agents + 1 summary
      expect(vi.mocked(chat)).toHaveBeenCalledTimes(4);
    });

    it("defaults to all three agents when none specified", async () => {
      const token = await loginAsTeacher();

      const response = await request(app.getHttpServer())
        .post("/teaching-agents/collaborate")
        .set("Authorization", `Bearer ${token}`)
        .send({ topic: "测试主题" });

      expect(response.status).toBe(201);
      expect(response.body.messages).toHaveLength(3);
    });

    it("limits agents to 3 (cost control)", async () => {
      const token = await loginAsTeacher();

      const response = await request(app.getHttpServer())
        .post("/teaching-agents/collaborate")
        .set("Authorization", `Bearer ${token}`)
        .send({
          agents: ["ta", "reviewer", "mentor", "ta", "reviewer"],
          topic: "测试",
        });

      expect(response.status).toBe(201);
      expect(response.body.messages.length).toBeLessThanOrEqual(3);
    });
  });

  /* ---------------------------------------------------------------- */
  /*  Auth guard                                                      */
  /* ---------------------------------------------------------------- */

  describe("authentication", () => {
    it("rejects all endpoints without auth", async () => {
      const endpoints = [
        { method: "get", path: "/teaching-agents/sop-types" },
        {
          method: "post",
          path: "/teaching-agents/question",
          body: { studentId: "x", question: "y" },
        },
        {
          method: "post",
          path: "/teaching-agents/review",
          body: { submissionId: "x" },
        },
        {
          method: "post",
          path: "/teaching-agents/quest-complete",
          body: { studentId: "x", questId: "y" },
        },
        {
          method: "post",
          path: "/teaching-agents/collaborate",
          body: { topic: "x" },
        },
      ];

      for (const endpoint of endpoints) {
        const req =
          endpoint.method === "get"
            ? request(app.getHttpServer()).get(endpoint.path)
            : request(app.getHttpServer())
                .post(endpoint.path)
                .send(endpoint.body);

        const response = await req;
        expect(response.status).toBe(401);
      }
    });
  });
});
