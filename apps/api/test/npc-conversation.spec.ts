import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { PrismaClient } from "@prisma/client";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { seedDatabase } from "../prisma/seed";
import { AppModule } from "../src/app.module";
import { NPC_PERSONAS } from "../src/modules/memory/npc-personas";
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

describe("npc conversation", () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let studentToken: string;

  async function loginAsStudent() {
    const response = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email: "lin@academy.test", password: "student-pass-123" });
    expect(response.status).toBe(201);
    return response.body.token as string;
  }

  function get(path: string) {
    return request(app.getHttpServer())
      .get(path)
      .set("Authorization", `Bearer ${studentToken}`);
  }

  function post(path: string) {
    return request(app.getHttpServer())
      .post(path)
      .set("Authorization", `Bearer ${studentToken}`);
  }

  beforeAll(async () => {
    prisma = await prepareTestDatabase("npc-conversation");

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
    studentToken = await loginAsStudent();
    // Reset mocks to default (degraded mode)
    vi.mocked(isArkConfigured).mockReturnValue(false);
    vi.mocked(chat).mockResolvedValue("");
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  /* ---------------------------------------------------------------- */
  /*  Degraded mode (ARK_API_KEY not set)                             */
  /* ---------------------------------------------------------------- */

  it("returns a greeting via GET /npc/:npcId/conversation in degraded mode", async () => {
    const response = await get("/npc/receptionist/conversation")
      .query({});

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      npcId: "receptionist",
      npcName: "前台接待",
      degraded: true,
    });
    expect(response.body.reply).toContain("欢迎");
  });

  it("returns a fallback reply when a message is provided in degraded mode", async () => {
    const response = await get("/npc/reviewer/conversation")
      .query({ message: "评审标准是什么？" });

    expect(response.status).toBe(200);
    expect(response.body.npcId).toBe("reviewer");
    expect(response.body.npcName).toBe("评审员");
    expect(response.body.degraded).toBe(true);
    expect(response.body.reply.length).toBeGreaterThan(0);
  });

  it("returns a reply via POST /npc/:npcId/conversation", async () => {
    const response = await post("/npc/pm/conversation")
      .send({ studentId: "student-1", message: "冲刺进度如何？" });

    expect(response.status).toBe(201);
    expect(response.body.npcId).toBe("pm");
    expect(response.body.npcName).toBe("项目经理");
    expect(response.body.degraded).toBe(true);
    expect(response.body.reply.length).toBeGreaterThan(0);
  });

  it("returns a default persona for unknown NPC IDs", async () => {
    const response = await get("/npc/unknown-npc/conversation");

    expect(response.status).toBe(200);
    expect(response.body.npcId).toBe("unknown-npc");
    expect(response.body.npcName).toBe("神秘NPC");
    expect(response.body.degraded).toBe(true);
  });

  /* ---------------------------------------------------------------- */
  /*  LLM mode (ARK_API_KEY is set)                                   */
  /* ---------------------------------------------------------------- */

  it("returns an LLM-generated greeting when ARK_API_KEY is set", async () => {
    vi.mocked(isArkConfigured).mockReturnValue(true);
    vi.mocked(chat).mockResolvedValueOnce("你好！我是前台接待，欢迎来到工作室。");

    const response = await get("/npc/receptionist/conversation");

    expect(response.status).toBe(200);
    expect(response.body.npcId).toBe("receptionist");
    expect(response.body.npcName).toBe("前台接待");
    expect(response.body.degraded).toBe(false);
    expect(response.body.reply).toContain("你好");
    // Verify the LLM was called
    expect(vi.mocked(chat)).toHaveBeenCalledTimes(1);
  });

  it("returns an LLM-generated reply when a message is provided", async () => {
    vi.mocked(isArkConfigured).mockReturnValue(true);
    vi.mocked(chat).mockResolvedValueOnce(
      "评审标准包括功能完整性、代码质量和创新性三个方面。",
    );

    const response = await get("/npc/reviewer/conversation")
      .query({ message: "评审标准是什么？" });

    expect(response.status).toBe(200);
    expect(response.body.degraded).toBe(false);
    expect(response.body.reply).toContain("评审标准");
    expect(vi.mocked(chat)).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          role: "system",
          content: expect.stringContaining(
            "不要编造学生进度、任务状态、评分、权限或实时 Agent 状态",
          ),
        }),
      ]),
    );
  });

  it("falls back to static reply when LLM call throws", async () => {
    vi.mocked(isArkConfigured).mockReturnValue(true);
    vi.mocked(chat).mockRejectedValueOnce(new Error("LLM unavailable"));

    const response = await get("/npc/receptionist/conversation");

    expect(response.status).toBe(200);
    expect(response.body.degraded).toBe(false);
    // Should fall back to greeting template
    expect(response.body.reply).toContain("欢迎");
  });

  it("persists conversation to NPC memory when studentId is provided", async () => {
    vi.mocked(isArkConfigured).mockReturnValue(true);
    vi.mocked(chat).mockResolvedValueOnce("这是一条测试回复。");

    const npcStudentId = "npc:receptionist";
    // Clear any existing NPC memories
    await prisma.agentMemory.deleteMany({ where: { studentId: npcStudentId } });
    // Create (or ensure) the NPC virtual user exists for the FK constraint
    await prisma.user.upsert({
      where: { id: npcStudentId },
      create: {
        id: npcStudentId,
        role: "student",
        email: "npc-receptionist@npc.internal",
        passwordHash: "npc-no-login",
        displayName: "NPC 前台接待",
        isOnline: false,
      },
      update: {},
    });

    await get("/npc/receptionist/conversation")
      .query({ studentId: "student-1", message: "你好" });

    // Verify a memory was recorded for the NPC
    const memories = await prisma.agentMemory.findMany({
      where: { studentId: npcStudentId },
    });
    expect(memories.length).toBeGreaterThan(0);
    expect(memories[0].type).toBe("observation");
    expect(memories[0].content).toContain("学生");
  });

  it("handles all 8 NPC IDs defined in zone-config", async () => {
    const npcIds = [
      "receptionist",
      "manager",
      "walker-a",
      "walker-b",
      "pm",
      "designer",
      "reviewer",
      "qa",
    ];

    for (const npcId of npcIds) {
      const response = await get(`/npc/${npcId}/conversation`);

      expect(response.status).toBe(200);
      expect(response.body.npcId).toBe(npcId);
      expect(response.body.npcName.length).toBeGreaterThan(0);
      expect(response.body.reply.length).toBeGreaterThan(0);
    }

    expect(NPC_PERSONAS["walker-a"]).toMatchObject({
      name: "巡场同事",
      role: expect.stringContaining("巡场工作人员"),
      fallbackReply: expect.stringContaining("评分、权限和个人进度请找老师或查看系统"),
    });
    expect(NPC_PERSONAS["walker-b"]).toMatchObject({
      name: "访客",
      role: expect.stringContaining("不是工作人员"),
      fallbackReply: expect.stringContaining("看不到内部任务、成绩或权限"),
    });
  });
});
