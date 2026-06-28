# Chat Overview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为教学世界补一个可被 `/chat` 页面消费的最小真实聊天概览接口，并让前端页面与组件从真实 API 取数而不再依赖硬编码。

**Architecture:** API 侧沿用现有 controller + Prisma read model 方式新增 `GET /chat?studentId=...`，直接聚合学生、Agent 会话、最近提交、活跃协作成员与协作贡献。Web 侧保持 `/chat` 页面负责 API 调用与文案映射，`ChatRoom` 只做纯展示组件，继续复用现有 `DayPanel` 关卡展示。

**Tech Stack:** NestJS, Prisma, Next.js App Router, Vitest, Testing Library, Supertest

---

### Task 1: 锁定 chat overview API 契约

**Files:**
- Modify: `/Users/alex/Downloads/game-system-two/apps/api/test/world-api.spec.ts`
- Modify: `/Users/alex/Downloads/game-system-two/apps/api/prisma/seed.ts`

- [ ] **Step 1: 写失败的 API 集成测试**

```ts
it("returns a student chat overview read model", async () => {
  const response = await request(app.getHttpServer()).get("/chat").query({
    studentId: "student-1"
  });

  expect(response.status).toBe(200);
  expect(response.body).toEqual({
    studentId: "student-1",
    studentName: "Lin",
    agentLabel: "Claude Code",
    sessionStatus: "active",
    sessionSummary: "最近一次对话聚焦 README 打磨与截图整理。",
    latestSubmission: {
      id: "submission-1",
      statusLabel: "待老师审核",
      submittedAt: "2026-06-29T10:00:00.000Z",
      dayLabel: "Day 1"
    },
    collaborationGuests: [
      {
        studentId: "student-2",
        studentName: "Mo",
        contributionLabel: "协作贡献 4"
      },
      {
        studentId: "student-3",
        studentName: "Kai",
        contributionLabel: "协作贡献 2"
      }
    ]
  });
});
```

- [ ] **Step 2: 运行单测确认失败**

Run: `pnpm --filter api test -- --run apps/api/test/world-api.spec.ts`
Expected: FAIL，提示 `GET /chat` 不存在或返回体不匹配。

- [ ] **Step 3: 补最小 seed 数据支撑 read model**

```ts
await prisma.agentSubmission.create({
  data: {
    id: "submission-1",
    studentId: "student-1",
    courseWorldId: "course-world-1",
    dayId: "day-1",
    agentSessionId: "session-1",
    triggerType: "button",
    conversationSummary: "最近一次对话聚焦 README 打磨与截图整理。",
    workSummary: "README、截图与提示词修正已提交。",
    artifacts: [{ kind: "doc", label: "README", url: "https://example.com/readme" }],
    selfReflection: "我知道该怎么告诉 Agent 成功标准。",
    agentEvaluationHints: ["one correction loop"],
    submittedAt: new Date("2026-06-29T10:00:00.000Z")
  }
});

await prisma.reviewResult.create({
  data: {
    submissionId: "submission-1",
    suggestedScore: 85,
    rationale: "Clear goal, evidence of correction, and visible artifact."
  }
});

await prisma.contributionLog.createMany({
  data: [
    {
      id: "contribution-1",
      actorId: "student-2",
      targetUserId: "student-1",
      kind: "collaboration",
      points: 4
    },
    {
      id: "contribution-2",
      actorId: "student-3",
      targetUserId: "student-1",
      kind: "peer_review",
      points: 2
    }
  ]
});
```

- [ ] **Step 4: 重跑测试观察仍因实现缺失失败**

Run: `pnpm --filter api test -- --run apps/api/test/world-api.spec.ts`
Expected: FAIL，状态码从 `404` 或返回字段缺失，证明测试已锁住真实需求。

### Task 2: 实现 API 与注册

**Files:**
- Create: `/Users/alex/Downloads/game-system-two/apps/api/src/modules/chat/chat.controller.ts`
- Modify: `/Users/alex/Downloads/game-system-two/apps/api/src/app.module.ts`

- [ ] **Step 1: 写最小控制器实现**

```ts
@Controller("chat")
export class ChatController {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  @Get()
  async getOverview(@Query("studentId") studentId: string) {
    const student = await this.prisma.user.findUniqueOrThrow({
      where: { id: studentId },
      include: {
        agentSessions: { orderBy: { createdAt: "desc" }, take: 1 },
        submissions: {
          include: { day: true, reviewResult: true },
          orderBy: { submittedAt: "desc" },
          take: 1
        }
      }
    });

    const contributionLogs = await this.prisma.contributionLog.findMany({
      where: { targetUserId: studentId },
      include: { actor: true },
      orderBy: [{ points: "desc" }, { createdAt: "desc" }]
    });

    const latestSession = student.agentSessions[0];
    const latestSubmission = student.submissions[0];

    return {
      studentId: student.id,
      studentName: student.displayName,
      agentLabel: this.toAgentLabel(latestSession?.provider ?? "unknown"),
      sessionStatus: latestSession?.status ?? "failed",
      sessionSummary:
        latestSubmission?.conversationSummary ?? "今天还没有新的会话摘要。",
      latestSubmission: latestSubmission
        ? {
            id: latestSubmission.id,
            statusLabel:
              latestSubmission.reviewResult?.reviewerId == null ? "待老师审核" : "已完成裁定",
            submittedAt: latestSubmission.submittedAt.toISOString(),
            dayLabel: this.toDayLabel(latestSubmission.day.id)
          }
        : null,
      collaborationGuests: contributionLogs.map((log) => ({
        studentId: log.actorId,
        studentName: log.actor.displayName,
        contributionLabel: `协作贡献 ${log.points}`
      }))
    };
  }
}
```

- [ ] **Step 2: 在 `AppModule` 注册控制器**

```ts
import { ChatController } from "./modules/chat/chat.controller";

controllers: [
  HealthController,
  AuthController,
  WorldController,
  QuestsController,
  GuildsController,
  RoomsController,
  SubmissionsController,
  ReviewsController,
  ChatController
];
```

- [ ] **Step 3: 运行 API 相关测试**

Run: `pnpm --filter api test -- --run apps/api/test/world-api.spec.ts apps/api/test/submission-flow.spec.ts`
Expected: PASS

### Task 3: 接上 Web api-client 与聊天页

**Files:**
- Modify: `/Users/alex/Downloads/game-system-two/apps/web/src/lib/api-client.ts`
- Modify: `/Users/alex/Downloads/game-system-two/apps/web/src/lib/api-client.test.ts`
- Modify: `/Users/alex/Downloads/game-system-two/apps/web/src/app/chat/page.tsx`
- Modify: `/Users/alex/Downloads/game-system-two/apps/web/src/app/chat/page.test.tsx`
- Modify: `/Users/alex/Downloads/game-system-two/apps/web/src/components/chat/chat-room.tsx`
- Modify: `/Users/alex/Downloads/game-system-two/apps/web/src/components/chat/chat-room.test.tsx`

- [ ] **Step 1: 写失败的页面与 client 测试**

```ts
vi.mock("../../lib/api-client", () => ({
  getChatOverview: vi.fn()
}));

vi.mocked(getChatOverview).mockResolvedValue({
  studentId: "student-1",
  studentName: "Lin",
  agentLabel: "Claude Code",
  sessionStatus: "active",
  sessionSummary: "最近一次对话聚焦 README 打磨与截图整理。",
  latestSubmission: {
    id: "submission-1",
    statusLabel: "待老师审核",
    submittedAt: "2026-06-29T10:00:00.000Z",
    dayLabel: "Day 1"
  },
  collaborationGuests: [
    { studentId: "student-2", studentName: "Mo", contributionLabel: "协作贡献 4" }
  ]
});
```

- [ ] **Step 2: 实现 api-client**

```ts
export type ChatOverviewPayload = {
  studentId: string;
  studentName: string;
  agentLabel: string;
  sessionStatus: "active" | "completed" | "failed";
  sessionSummary: string;
  latestSubmission: {
    id: string;
    statusLabel: string;
    submittedAt: string;
    dayLabel: string;
  } | null;
  collaborationGuests: Array<{
    studentId: string;
    studentName: string;
    contributionLabel: string;
  }>;
};

export async function getChatOverview(studentId: string) {
  return fetchJson<ChatOverviewPayload>(`/chat?studentId=${studentId}`);
}
```

- [ ] **Step 3: 最小改造 `/chat` 页面**

```tsx
export default async function ChatPage() {
  const [chatOverview, quests] = await Promise.all([
    getChatOverview("student-1"),
    getQuestList()
  ]);

  const currentQuest = quests.find((quest) => quest.status === "open") ?? quests[0];

  return (
    <main>
      <ChatRoom
        studentName={chatOverview.studentName}
        agentLabel={chatOverview.agentLabel}
        sessionSummary={chatOverview.sessionSummary}
        latestSubmissionStatus={chatOverview.latestSubmission?.statusLabel ?? "今日未提交"}
        collaborationGuests={chatOverview.collaborationGuests.map((guest) => guest.studentName)}
      />
      <DayPanel currentDayId={currentQuest?.id ?? ""} days={dayItems} />
    </main>
  );
}
```

- [ ] **Step 4: 让 `ChatRoom` 支持真实概览字段**

```tsx
type ChatRoomProps = {
  studentName: string;
  agentLabel: string;
  sessionSummary: string;
  latestSubmissionStatus: string;
  collaborationGuests: string[];
  latestSubmissionMeta?: string;
};
```

- [ ] **Step 5: 运行 Web 单测**

Run: `pnpm --filter web test -- --run src/lib/api-client.test.ts src/app/chat/page.test.tsx src/components/chat/chat-room.test.tsx`
Expected: PASS

### Task 4: 全量验证、方法论沉淀与提交

**Files:**
- Modify: `/Users/alex/Downloads/game-system-two/AGENTS.md`

- [ ] **Step 1: 将本次高价值方法论补入 AGENTS**

```md
### 17. 聊天概览先做只读聚合，再考虑消息流与授权细化

- `/chat` 这类页面早期最需要的是“能打开并看到真实教学上下文”，不是先把实时消息、细粒度授权、已读回执一次做满
- 后端先提供 `chat overview` 只读 read model，直接聚合学生、Agent 会话、最近提交与协作贡献，前端页面先消费这份稳定概览
- 只要页面当前只服务单个默认学生，也优先用 `studentId` 查询参数把 read model 边界钉住，避免后续从硬编码页面回退到接口时重新改契约
- 协作相关信息在早期可以先基于贡献日志或工会关系做最小推导，不必等完整授权模型就绪后再让页面脱离硬编码
- TDD 先锁接口返回体，再接页面与组件，确保“真实数据替换硬编码”由测试证明，而不是靠肉眼查看页面
```

- [ ] **Step 2: 跑完整验证**

Run: `pnpm --filter api test && pnpm --filter web test && pnpm --filter web build`
Expected: 全部 PASS

- [ ] **Step 3: 检查工作区并提交**

```bash
git status --short
git add apps/api apps/web AGENTS.md docs/superpowers/plans/2026-06-29-chat-overview-implementation.md
git commit -m "feat(chat): back chat overview with prisma"
git rev-parse HEAD
```
