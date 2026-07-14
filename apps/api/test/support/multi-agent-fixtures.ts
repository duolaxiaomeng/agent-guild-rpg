import type { INestApplication } from "@nestjs/common";
import { AgentSessionStatus, type PrismaClient } from "@prisma/client";
import request from "supertest";

export type TokenMap = {
  tokenLin: string;
  tokenMo: string;
  tokenKai: string;
  tokenTeacher: string;
};

/**
 * The seed only creates session-1 for student-1.
 * This helper补建 session-2 (student-2 / Mo) and session-3 (student-3 / Kai)
 * so that all three students can submit with their own agentSessionId.
 */
export async function ensureAgentSessions(prisma: PrismaClient): Promise<void> {
  await prisma.agentSession.createMany({
    data: [
      {
        id: "session-2",
        studentId: "student-2",
        provider: "claude-code",
        status: AgentSessionStatus.active,
      },
      {
        id: "session-3",
        studentId: "student-3",
        provider: "claude-code",
        status: AgentSessionStatus.active,
      },
    ],
  });
}

/**
 * Login all four roles and return a token map.
 * Uses sequential requests to avoid ECONNRESET with supertest.
 */
export async function loginAll(app: INestApplication): Promise<TokenMap> {
  async function login(email: string, password: string): Promise<string> {
    const response = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email, password });
    if (response.status !== 201) {
      throw new Error(`Login failed for ${email}: ${response.status}`);
    }
    return response.body.token as string;
  }

  const tokenLin = await login("lin@academy.test", "student-pass-123");
  const tokenMo = await login("mo@academy.test", "student-pass-456");
  const tokenKai = await login("kai@academy.test", "student-pass-789");
  const tokenTeacher = await login("teacher@academy.test", "teacher-pass-123");

  return { tokenLin, tokenMo, tokenKai, tokenTeacher };
}

type StudentProfile = {
  conversation: string;
  work: string;
  reflection: string;
  timestamp: string;
};

const STUDENT_PROFILES: Record<string, StudentProfile> = {
  "student-1": {
    conversation:
      "与 Agent 讨论了编程基础概念和实践方法，探索了工具调用模式",
    work: "完成了 Agent 编程入门练习，编写了基础对话逻辑和工具调用",
    reflection:
      "通过这次练习我理解了 Agent 的基本工作原理和工具调用机制",
    timestamp: "2026-07-01T08:00:00.000Z",
  },
  "student-2": {
    conversation:
      "与 Agent 探讨了 Prompt 设计策略和输出质量控制方法",
    work: "迭代优化了 Prompt 模板，通过多次调试提升了 Agent 输出质量",
    reflection:
      "我学会了如何通过 Prompt 工程方法系统性地改进 Agent 表现",
    timestamp: "2026-07-01T09:00:00.000Z",
  },
  "student-3": {
    conversation:
      "与 Agent 讨论了测试用例设计和边界条件覆盖策略",
    work: "为 Agent 编写了单元测试和集成测试，覆盖了核心交互路径",
    reflection:
      "我认识到测试驱动开发对 Agent 系统质量保障的重要性",
    timestamp: "2026-07-01T10:00:00.000Z",
  },
};

/**
 * Build a differentiated submission body for each student.
 */
export function buildSubmissionBody(
  studentId: string,
  sessionId: string,
  dayId: string,
): Record<string, unknown> {
  const profile = STUDENT_PROFILES[studentId] ?? STUDENT_PROFILES["student-1"];

  return {
    studentId,
    courseWorldId: "course-world-1",
    dayId,
    agentSessionId: sessionId,
    triggerType: "button",
    conversationSummary: profile.conversation,
    workSummary: profile.work,
    artifacts: [
      {
        kind: "repo",
        label: `agent-project-${studentId}`,
        url: `https://github.com/example/agent-project-${studentId}`,
      },
    ],
    selfReflection: profile.reflection,
    agentEvaluationHints: ["代码结构清晰", "需要更多注释"],
    timestamp: profile.timestamp,
  };
}

/**
 * Wait for queueMicrotask-based async side effects to complete.
 */
export function flush(ms: number = 50): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
