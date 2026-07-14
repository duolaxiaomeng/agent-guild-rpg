import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { PrismaClient, UserRole } from "@prisma/client";
import request from "supertest";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/modules/memory/llm/ark-adapter", () => ({
  isArkConfigured: vi.fn(() => false),
  scoreImportance: vi.fn(async () => 5.0),
  generateReflections: vi.fn(async () => []),
  chat: vi.fn(async () => ""),
  chatMultimodal: vi.fn(async () => ""),
}));

import { chat, generateReflections, isArkConfigured } from "../src/modules/memory/llm/ark-adapter";
import { AppModule } from "../src/app.module";
import { ReviewProcessingService } from "../src/modules/queue/review.processor";
import { ReviewQueueService } from "../src/modules/queue/review.queue";
import { prepareTestDatabase } from "./support/test-database";
import {
  buildSubmissionBody,
  ensureAgentSessions,
  flush,
  loginAll,
} from "./support/multi-agent-fixtures";

const STUDENT_IDS = ["student-1", "student-2", "student-3"] as const;
const NPC_IDS = [
  "receptionist",
  "manager",
  "walker-a",
  "walker-b",
  "pm",
  "designer",
  "reviewer",
  "qa",
] as const;

describe("multi-agent e2e", () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let reviewProcessingService: ReviewProcessingService;

  beforeAll(async () => {
    prisma = await prepareTestDatabase("multi-agent-e2e");
    await ensureAgentSessions(prisma);

    // Create NPC user records so AgentMemory FK (studentId → User.id) is satisfied
    // when the NPC conversation service persists memory with studentId = "npc:<npcId>"
    await prisma.user.create({
      data: {
        id: "npc:receptionist",
        role: UserRole.teacher,
        email: "npc-receptionist@npc.test",
        passwordHash: "npc-pass",
        displayName: "NPC receptionist",
        isOnline: false,
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
    await app.listen(0);
    reviewProcessingService = app.get(ReviewProcessingService);
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  /* ---------------------------------------------------------------- */
  /*  Main closed-loop: phases 0–10 in a single it                    */
  /* ---------------------------------------------------------------- */

  it("runs the full five-stage teaching loop with 3 students + 1 teacher (degraded)", async () => {
    const tokens = await loginAll(app);
    const studentTokens = [tokens.tokenLin, tokens.tokenMo, tokens.tokenKai];

    /* ---- Phase 0: multi-role login ---- */
    expect(tokens.tokenLin).toBeTruthy();
    expect(tokens.tokenMo).toBeTruthy();
    expect(tokens.tokenKai).toBeTruthy();
    expect(tokens.tokenTeacher).toBeTruthy();

    const sessions = await Promise.all(
      [tokens.tokenLin, tokens.tokenMo, tokens.tokenKai, tokens.tokenTeacher].map(
        (token) =>
          request(app.getHttpServer())
            .get("/auth/session")
            .set("Authorization", `Bearer ${token}`),
      ),
    );
    expect(sessions[0].body.user.role).toBe("student");
    expect(sessions[1].body.user.role).toBe("student");
    expect(sessions[2].body.user.role).toBe("student");
    expect(sessions[3].body.user.role).toBe("teacher");

    /* ---- Phase 1: concurrent world view ---- */
    const worldQuestsGuilds = await Promise.all(
      studentTokens.flatMap((token) => [
        request(app.getHttpServer()).get("/world").set("Authorization", `Bearer ${token}`),
        request(app.getHttpServer()).get("/quests").set("Authorization", `Bearer ${token}`),
        request(app.getHttpServer()).get("/guilds").set("Authorization", `Bearer ${token}`),
      ]),
    );

    // All three students see the same course world
    const [linWorld, linQuests, linGuilds] = worldQuestsGuilds;
    expect(linWorld.body.currentDay).toBe(1);
    expect(linQuests.body.find((q: { id: string }) => q.id === "day-1").status).toBe("open");
    expect(linGuilds.body[0].memberCount).toBe(3);

    // Verify the other two students see the same data
    const [, , moGuilds] = worldQuestsGuilds;
    const [, , , , , kaiGuilds] = worldQuestsGuilds;
    expect(moGuilds.body[0].memberCount).toBe(3);
    expect(kaiGuilds.body[0].memberCount).toBe(3);

    /* ---- Phase 2: three students Q&A SOP (degraded) ---- */
    const questions = [
      { studentId: "student-1", question: "什么是 Agent 编程？" },
      { studentId: "student-2", question: "如何设计好的 Prompt？" },
      { studentId: "student-3", question: "Agent 测试应该覆盖哪些场景？" },
    ];

    const qaResponses = await Promise.all(
      questions.map((q, i) =>
        request(app.getHttpServer())
          .post("/teaching-agents/question")
          .set("Authorization", `Bearer ${studentTokens[i]}`)
          .send(q),
      ),
    );

    for (const response of qaResponses) {
      expect(response.status).toBe(201);
      expect(response.body.sopType).toBe("student-question");
      expect(response.body.degraded).toBe(true);
      expect(response.body.steps).toHaveLength(3);
      expect(response.body.steps[0].agentRole).toBe("ta");
      expect(response.body.steps[1].agentRole).toBe("mentor");
      expect(response.body.steps[2].agentRole).toBe("ta");
      expect(response.body.finalOutput).toContain("SOP 完成");
    }

    // Wait for queueMicrotask-based memory writes
    await flush();

    const qaMemories = await prisma.agentMemory.findMany({
      where: { studentId: "student-1", type: "observation" },
      orderBy: { createdAt: "desc" },
      take: 1,
    });
    expect(qaMemories.length).toBeGreaterThan(0);
    expect(qaMemories[0].type).toBe("observation");
    expect(qaMemories[0].importance).toBe(5.0);
    expect(qaMemories[0].content).toContain("SOP答疑结果");

    /* ---- Phase 3: three students submit assignments ---- */
    // Seed submissions are useful for world rendering but would trigger the
    // duplicate-pending guard. The closed-loop fixture starts from a clean
    // submission/review state.
    await prisma.reviewResult.deleteMany();
    await prisma.agentSubmission.deleteMany();
    const submissionBodies = STUDENT_IDS.map((id, i) =>
      buildSubmissionBody(id, `session-${i + 1}`, "day-1"),
    );

    const submissionResponses = await Promise.all(
      submissionBodies.map((body, i) =>
        request(app.getHttpServer())
          .post("/submissions")
          .set("Authorization", `Bearer ${studentTokens[i]}`)
          .send(body),
      ),
    );

    const submissionIds: string[] = [];
    for (let i = 0; i < submissionResponses.length; i++) {
      const response = submissionResponses[i];
      expect(response.status).toBe(201);
      expect(response.body.submission.studentId).toBe(STUDENT_IDS[i]);
      expect(response.body.submission.id).toBeTruthy();
      expect(response.body.review).toEqual({
        submissionId: response.body.submission.id,
        status: "queued",
        suggestedScore: null,
        finalScore: null,
        decision: null,
        rationale: "AI review queued.",
        riskFlags: [],
      });
      expect(response.body.queue).toEqual({
        jobId: `review-${response.body.submission.id}`,
        status: "queued",
      });
      submissionIds.push(response.body.submission.id);
    }

    // Flush for async review processing, memory, and SOP triggers
    await flush();

    /* ---- Phase 4: review SOP + multi-agent collaboration (degraded) ---- */
    const reviewSopResponses = await Promise.all(
      submissionIds.map((id, i) =>
        request(app.getHttpServer())
          .post("/teaching-agents/review")
          .set("Authorization", `Bearer ${studentTokens[i]}`)
          .send({ submissionId: id }),
      ),
    );

    for (const response of reviewSopResponses) {
      expect(response.status).toBe(201);
      expect(response.body.sopType).toBe("submission-review");
      expect(response.body.degraded).toBe(true);
      expect(response.body.steps).toHaveLength(3);
      expect(response.body.steps[0].agentRole).toBe("reviewer");
      expect(response.body.steps[1].agentRole).toBe("ta");
      expect(response.body.steps[2].agentRole).toBe("reviewer");
      expect(response.body.finalOutput).toContain("SOP 完成");
    }

    const collabResponse = await request(app.getHttpServer())
      .post("/teaching-agents/collaborate")
      .set("Authorization", `Bearer ${tokens.tokenTeacher}`)
      .send({
        agents: ["ta", "reviewer", "mentor"],
        topic: "如何提高 Agent 编程能力",
      });

    expect(collabResponse.status).toBe(201);
    expect(collabResponse.body.degraded).toBe(true);
    expect(collabResponse.body.topic).toBe("如何提高 Agent 编程能力");
    expect(collabResponse.body.messages).toHaveLength(3);
    expect(collabResponse.body.messages[0].agentRole).toBe("ta");
    expect(collabResponse.body.messages[1].agentRole).toBe("reviewer");
    expect(collabResponse.body.messages[2].agentRole).toBe("mentor");
    expect(collabResponse.body.summary.length).toBeGreaterThan(0);

    await flush();

    /* ---- Phase 5: quest completion SOP ---- */
    const questCompleteResponses = await Promise.all(
      STUDENT_IDS.map((studentId, i) =>
        request(app.getHttpServer())
          .post("/teaching-agents/quest-complete")
          .set("Authorization", `Bearer ${studentTokens[i]}`)
          .send({ studentId, questId: "day-1" }),
      ),
    );

    for (const response of questCompleteResponses) {
      expect(response.status).toBe(201);
      expect(response.body.sopType).toBe("quest-completion");
      expect(response.body.degraded).toBe(true);
      expect(response.body.steps).toHaveLength(3);
      expect(response.body.steps[0].agentRole).toBe("reviewer");
      expect(response.body.steps[1].agentRole).toBe("ta");
      expect(response.body.steps[2].agentRole).toBe("reviewer");
      expect(response.body.finalOutput).toContain("SOP 完成");
      expect(response.body.steps[2].output).toContain("关卡完成报告");
    }

    await flush();

    /* ---- Phase 6: NPC dialog (public endpoint) ---- */
    const npcResponse = await request(app.getHttpServer())
      .get("/npc/receptionist/conversation")
      .set("Authorization", `Bearer ${tokens.tokenLin}`)
      .query({ studentId: "student-1" });

    expect(npcResponse.status).toBe(200);
    expect(npcResponse.body.degraded).toBe(true);
    expect(npcResponse.body.npcName).toContain("前台");
    expect(npcResponse.body.reply.length).toBeGreaterThan(0);

    // Iterate all 8 NPC IDs
    for (const npcId of NPC_IDS) {
      const response = await request(app.getHttpServer())
        .get(`/npc/${npcId}/conversation`)
        .set("Authorization", `Bearer ${tokens.tokenLin}`)
        .query({ studentId: "student-1" });
      expect(response.status).toBe(200);
      expect(response.body.degraded).toBe(true);
      expect(response.body.reply.length).toBeGreaterThan(0);
    }

    /* ---- Phase 7: teacher review decisions ---- */
    // Manually advance AI initial review for each submission
    for (const id of submissionIds) {
      await reviewProcessingService.processSubmissionReview(id);
    }

    // Teacher decides: approve (Lin), adjust (Mo), reject (Kai)
    const decisions = [
      { submissionId: submissionIds[0], finalScore: 85, decision: "approve" },
      { submissionId: submissionIds[1], finalScore: 75, decision: "adjust" },
      { submissionId: submissionIds[2], finalScore: 50, decision: "reject" },
    ];

    for (const decision of decisions) {
      const response = await request(app.getHttpServer())
        .post("/reviews/decide")
        .set("Authorization", `Bearer ${tokens.tokenTeacher}`)
        .send(decision);
      expect(response.status).toBe(201);
      expect(response.body.decision).toBe(decision.decision);
      expect(response.body.finalScore).toBe(decision.finalScore);
    }

    await flush();

    // GET /reviews — verify summary and items
    const reviewListResponse = await request(app.getHttpServer())
      .get("/reviews")
      .set("Authorization", `Bearer ${tokens.tokenTeacher}`);

    expect(reviewListResponse.status).toBe(200);
    expect(reviewListResponse.body.summary).toEqual({
      pendingCount: 0,
      queuedCount: 0,
      pendingTeacherDecisionCount: 0,
      reviewedToday: 3,
      flaggedCount: 2,
    });
    expect(reviewListResponse.body.items).toHaveLength(3);
    const studentNames = reviewListResponse.body.items.map(
      (i: { studentName: string }) => i.studentName,
    );
    expect(studentNames).toContain("Lin");
    expect(studentNames).toContain("Mo");
    expect(studentNames).toContain("Kai");

    /* ---- Phase 8: learning insights ---- */
    const studentInsightResponse = await request(app.getHttpServer())
      .get("/learning-insights/student/student-1")
      .set("Authorization", `Bearer ${tokens.tokenLin}`);

    expect(studentInsightResponse.status).toBe(200);
    expect(studentInsightResponse.body).toHaveProperty("strengths");
    expect(studentInsightResponse.body).toHaveProperty("weaknesses");
    expect(studentInsightResponse.body).toHaveProperty("recommendations");
    expect(studentInsightResponse.body).toHaveProperty("nextQuestSuggestion");
    expect(Array.isArray(studentInsightResponse.body.strengths)).toBe(true);
    expect(Array.isArray(studentInsightResponse.body.weaknesses)).toBe(true);
    expect(Array.isArray(studentInsightResponse.body.recommendations)).toBe(true);
    expect(typeof studentInsightResponse.body.nextQuestSuggestion).toBe("string");

    const classInsightResponse = await request(app.getHttpServer())
      .get("/learning-insights/class")
      .query({ teacherId: "teacher-1" })
      .set("Authorization", `Bearer ${tokens.tokenTeacher}`);

    expect(classInsightResponse.status).toBe(200);
    expect(classInsightResponse.body).toHaveProperty("commonIssues");
    expect(classInsightResponse.body).toHaveProperty("topPerformers");
    expect(classInsightResponse.body).toHaveProperty("needsAttention");
    expect(classInsightResponse.body).toHaveProperty("classProgress");
    expect(Array.isArray(classInsightResponse.body.topPerformers)).toBe(true);
    expect(Array.isArray(classInsightResponse.body.needsAttention)).toBe(true);

    // Student cross-access → 403
    const forbiddenResponse = await request(app.getHttpServer())
      .get("/learning-insights/student/student-2")
      .set("Authorization", `Bearer ${tokens.tokenLin}`);

    expect(forbiddenResponse.status).toBe(403);

    /* ---- Phase 9: memory retrieval and reflection ---- */
    const retrieveResponse = await request(app.getHttpServer())
      .get("/agent-memory/retrieve")
      .query({ studentId: "student-1", query: "Agent" })
      .set("Authorization", `Bearer ${tokens.tokenLin}`);

    expect(retrieveResponse.status).toBe(200);
    expect(Array.isArray(retrieveResponse.body)).toBe(true);
    expect(retrieveResponse.body.length).toBeGreaterThan(0);
    // Assert sorted by score descending
    for (let i = 1; i < retrieveResponse.body.length; i++) {
      expect(retrieveResponse.body[i].score).toBeLessThanOrEqual(
        retrieveResponse.body[i - 1].score,
      );
    }

    // Reflect with insufficient cumulative importance → empty
    const reflectResponse1 = await request(app.getHttpServer())
      .post("/agent-memory/reflect")
      .set("Authorization", `Bearer ${tokens.tokenLin}`)
      .send({ studentId: "student-1" });

    expect(reflectResponse1.status).toBe(201);
    expect(reflectResponse1.body.insights).toEqual([]);

    // Inject high-importance observations to exceed threshold (150)
    for (let i = 0; i < 20; i++) {
      await request(app.getHttpServer())
        .post("/agent-memory/observe")
        .set("Authorization", `Bearer ${tokens.tokenLin}`)
        .send({
          studentId: "student-1",
          type: "observation",
          content: `高重要性学习事件 #${i}: 深入理解了 Agent 系统架构设计`,
          importance: 10.0,
        });
    }

    // Flush to let any maybeAutoReflect complete with default mock
    await flush();

    // Mock generateReflections to return non-empty
    vi.mocked(generateReflections).mockResolvedValue([
      "Agent 系统架构需要关注模块解耦",
      "Prompt 工程是提升 Agent 质量的关键",
      "测试驱动开发保障 Agent 可靠性",
      "Agent 协作模式提升问题解决效率",
      "持续反思是学习进步的核心动力",
    ]);

    const reflectResponse2 = await request(app.getHttpServer())
      .post("/agent-memory/reflect")
      .set("Authorization", `Bearer ${tokens.tokenLin}`)
      .send({ studentId: "student-1" });

    expect(reflectResponse2.status).toBe(201);
    expect(reflectResponse2.body.insights.length).toBeGreaterThan(0);

    // Reset mock to default
    vi.mocked(generateReflections).mockResolvedValue([]);

    /* ---- Phase 10: agent avatars ---- */
    const avatarsResponse = await request(app.getHttpServer())
      .get("/agent-avatars")
      .set("Authorization", `Bearer ${tokens.tokenTeacher}`);

    expect(avatarsResponse.status).toBe(200);
    expect(Array.isArray(avatarsResponse.body)).toBe(true);
    expect(avatarsResponse.body.length).toBe(3);
    const avatarNames = avatarsResponse.body.map(
      (a: { displayName: string }) => a.displayName,
    );
    expect(avatarNames).toContain("Lin");
    expect(avatarNames).toContain("Mo");
    expect(avatarNames).toContain("Kai");

    const workstationsResponse = await request(app.getHttpServer())
      .get("/agent-avatars")
      .set("Authorization", `Bearer ${tokens.tokenTeacher}`)
      .query({ zone: "workstations" });

    expect(workstationsResponse.status).toBe(200);
    expect(workstationsResponse.body.length).toBe(3);
    for (const avatar of workstationsResponse.body) {
      expect(avatar.currentZone).toBe("workstations");
    }
  });

  /* ---------------------------------------------------------------- */
  /*  LLM dual-track slices (separate describe)                       */
  /* ---------------------------------------------------------------- */

  describe("LLM mode", () => {
    beforeEach(async () => {
      vi.mocked(isArkConfigured).mockReturnValue(true);
      await flush();
    });

    afterEach(() => {
      vi.mocked(isArkConfigured).mockReturnValue(false);
      vi.mocked(chat).mockReset();
      vi.mocked(chat).mockResolvedValue("");
      vi.mocked(generateReflections).mockReset();
      vi.mocked(generateReflections).mockResolvedValue([]);
    });

    async function loginStudent(): Promise<string> {
      const response = await request(app.getHttpServer())
        .post("/auth/login")
        .send({ email: "lin@academy.test", password: "student-pass-123" });
      return response.body.token as string;
    }

    it("uses LLM for student-question SOP (3 chat calls)", async () => {
      vi.mocked(chat)
        .mockResolvedValueOnce("助教初步解答: Agent编程是构建智能体的核心技能")
        .mockResolvedValueOnce("答疑深度解析: 从原理来看需要理解LLM调用")
        .mockResolvedValueOnce("综合回答: 综上所述，Agent编程需要理论与实践结合");

      const token = await loginStudent();

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
      expect(vi.mocked(chat)).toHaveBeenCalledTimes(3);
    });

    it("uses LLM for multi-agent collaboration (4 chat calls)", async () => {
      vi.mocked(chat)
        .mockResolvedValueOnce("助教观点: 多练习基础概念")
        .mockResolvedValueOnce("评审观点: 关注代码质量")
        .mockResolvedValueOnce("导师观点: 理解底层原理")
        .mockResolvedValueOnce("讨论总结: 综合三个方面的建议");

      const teacherLogin = await request(app.getHttpServer())
        .post("/auth/login")
        .send({ email: "teacher@academy.test", password: "teacher-pass-123" });
      const token = teacherLogin.body.token as string;

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
      expect(vi.mocked(chat)).toHaveBeenCalledTimes(4);
    });

    it("uses LLM for NPC conversation and persists memory", async () => {
      vi.mocked(chat).mockResolvedValueOnce("LLM NPC reply: 欢迎来到工作室，我是前台接待！");

      const token = await loginStudent();

      const response = await request(app.getHttpServer())
        .get("/npc/receptionist/conversation")
        .set("Authorization", `Bearer ${token}`)
        .query({ studentId: "student-1", message: "你好" });

      expect(response.status).toBe(200);
      expect(response.body.degraded).toBe(false);
      expect(response.body.reply).toContain("LLM NPC reply");
      expect(vi.mocked(chat)).toHaveBeenCalledTimes(1);

      // The observe() call is awaited inside getConversation, so memory
      // should already be persisted before the response is returned.
      const npcMemories = await prisma.agentMemory.findMany({
        where: { studentId: "npc:receptionist", type: "observation" },
        orderBy: { createdAt: "desc" },
        take: 1,
      });
      expect(npcMemories.length).toBeGreaterThan(0);
      expect(npcMemories[0].content).toContain("学生student-1");
    });

    it("uses LLM for reflection and returns 5 insights", async () => {
      // Ensure cumulative importance exceeds threshold (150) regardless of
      // whether the main loop completed.
      const token = await loginStudent();
      for (let i = 0; i < 20; i++) {
        await request(app.getHttpServer())
          .post("/agent-memory/observe")
          .set("Authorization", `Bearer ${token}`)
          .send({
            studentId: "student-1",
            type: "observation",
            content: `LLM反思前置学习事件 #${i}`,
            importance: 10.0,
          });
      }
      await flush();

      vi.mocked(generateReflections).mockResolvedValue([
        "Agent 架构需要模块化解耦",
        "Prompt 工程是质量关键",
        "测试驱动保障可靠性",
        "协作模式提升效率",
        "反思是学习核心动力",
      ]);

      const response = await request(app.getHttpServer())
        .post("/agent-memory/reflect")
        .set("Authorization", `Bearer ${token}`)
        .send({ studentId: "student-1" });

      expect(response.status).toBe(201);
      expect(response.body.insights.length).toBeGreaterThan(0);
    });
  });
});
