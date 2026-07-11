# Classroom Control Center Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在现有 Agent Guild RPG 中实现一套可用于真实课堂的课堂指挥台：老师控制阶段推进和计时，老师/助教处理学生求助，学生实时看到课堂状态，断线与刷新不丢状态。

**Architecture:** 课程内容仍由 `CourseWorld`/`QuestDay` 表达，课堂现场新增 `ClassroomSession`、`ClassroomStage`、`ClassroomStaffAssignment`、`HelpRequest`、`ClassroomEvent` 五类持久化对象。API 通过事务和版本号维护唯一真相，Socket.IO 只广播状态变化，Web 通过共享 Zod 契约消费快照，并保留 REST/轮询降级。

**Tech Stack:** Prisma 6 + SQLite 测试数据库、NestJS 11、Socket.IO、Next.js 15 App Router、React 19、Vitest、Testing Library、Playwright、共享 Zod contracts。

## Global Constraints

- `CourseWorld` 和 `QuestDay` 继续表达课程内容与教学解锁，课堂模型只表达一次课堂执行。
- 全局账号角色仍只有 `teacher`、`student`；助教只能通过课堂内 `ClassroomStaffAssignment` 表达。
- REST 与数据库是业务真相，Socket.IO 只负责即时广播；断线时 REST 和轮询必须可用。
- 阶段计时以服务端时间为准，客户端不能持久化或擅自修改最终剩余时间。
- 阶段状态只允许 `draft | running | paused | completed | ended_early`；求助状态只允许 `open | claimed | resolved | cancelled`。
- 所有状态变更、版本递增和 `ClassroomEvent` 写入必须在同一数据库事务中完成。
- SQLite 集成测试必须自行设置 `DATABASE_URL`、执行 `prisma db push`、运行共享 seed，不依赖开发者预先初始化数据库。
- 每个任务都先写失败测试，再实现最小代码，最后运行该任务的定向测试；不要用无关全量测试失败掩盖当前任务结果。
- 不引入排课、多班级、录像或复杂报表；第一版只支持一场课堂及一个当前阶段。

---

## 文件与边界地图

### 共享契约与数据库

- Create: `packages/contracts/src/classroom.ts` — 课堂快照、阶段、求助、控制请求和错误 payload 的 Zod schema 与 TypeScript 类型。
- Create: `packages/contracts/src/classroom.test.ts` — 合法快照、非法状态和控制请求契约测试。
- Modify: `packages/contracts/src/index.ts` — 导出 classroom schemas/types。
- Modify: `apps/api/prisma/schema.prisma` — 新增课堂模型、枚举、关系和索引。
- Modify: `apps/api/prisma/seed.ts` — 写入可读的课堂起始快照。
- Modify: `apps/api/test/contracts/database-shape.spec.ts` — 锁定模型、枚举和关键关系出现于 schema。

### API

- Create: `apps/api/src/modules/classrooms/classrooms.module.ts` — 注册课堂 controller/service。
- Create: `apps/api/src/modules/classrooms/classrooms.service.ts` — 课堂快照、阶段转换、计时计算、事件事务和权限。
- Create: `apps/api/src/modules/classrooms/classrooms.controller.ts` — DTO、鉴权和 HTTP 路由。
- Create: `apps/api/test/classroom-flow.spec.ts` — 课堂阶段与求助的端到端 HTTP/Prisma 流程测试。
- Modify: `apps/api/src/app.module.ts` — 导入 `ClassroomsModule`。

### 实时层

- Modify: `apps/api/src/modules/realtime/realtime.gateway.ts` — 课堂频道订阅和阶段/求助广播。
- Modify: `apps/api/test/realtime.spec.ts` — 课堂事件广播与房间路由测试。

### Web 数据与组件

- Modify: `apps/web/src/lib/api-client.ts` — 课堂快照、阶段控制、求助读写方法。
- Modify: `apps/web/src/lib/api-client.test.ts` — 请求路径、headers、body 和安全降级测试。
- Create: `apps/web/src/components/classroom/classroom-control-panel.tsx` — 老师控制台当前课堂与阶段控制。
- Create: `apps/web/src/components/classroom/classroom-control-panel.test.tsx` — 控制按钮和状态反馈测试。
- Create: `apps/web/src/components/classroom/help-queue.tsx` — 老师/助教求助队列与认领/解决。
- Create: `apps/web/src/components/classroom/help-queue.test.tsx` — 权限、认领和解决交互测试。
- Create: `apps/web/src/components/classroom/student-classroom-banner.tsx` — 学生阶段、倒计时和举手求助。
- Create: `apps/web/src/components/classroom/student-classroom-banner.test.tsx` — 学生状态和提交求助测试。
- Create: `apps/web/src/components/classroom/classroom-socket.ts` — Socket.IO 课堂频道连接、版本过滤和断线状态。
- Modify: `apps/web/src/app/teacher/page.tsx` — 服务端读取课堂快照并挂载老师控制台。
- Modify: `apps/web/src/app/teacher/page.test.tsx` — 教师课堂区域和安全降级断言。
- Modify: `apps/web/src/components/world/world-shell.tsx` — 学生主城区挂载课堂状态条。
- Modify: `apps/web/src/components/world/world-shell.test.tsx` — 学生课堂状态条挂载契约。
- Modify: `apps/web/src/app/chat/page.tsx` — 聊天页复用课堂状态条和求助入口。
- Modify: `apps/web/src/app/chat/page.test.tsx` — 聊天页课堂状态和安全降级测试。
- Create: `apps/web/tests/e2e/classroom-flow.spec.ts` — 老师启动、学生看到、学生求助、助教处理的浏览器流程。
- Modify: `apps/web/playwright.config.ts` — 为课堂 E2E 保持 3100 Web 端口和现有 API 配置。

---

### Task 1: 共享课堂契约与 Prisma 数据形状

**Files:**
- Create: `packages/contracts/src/classroom.test.ts`
- Create: `packages/contracts/src/classroom.ts`
- Modify: `packages/contracts/src/index.ts`
- Modify: `apps/api/prisma/schema.prisma`
- Modify: `apps/api/prisma/seed.ts`
- Modify: `apps/api/test/contracts/database-shape.spec.ts`

**Interfaces:**
- Produces `ClassroomStageStatus`, `HelpRequestStatus`, `ClassroomSnapshot`, `ClassroomStage`, `HelpRequest`, `ClassroomControlInput` and `CreateHelpRequestInput` from `packages/contracts/src/classroom.ts`.
- `ClassroomSnapshot` 至少包含 `{ session, currentStage, stages, helpRequests, viewer, serverNow }`；`session` 包含 `id`, `courseWorldId`, `dayId`, `status`, `version`；`viewer` 包含 `role`, `canControlStages`, `canHandleHelp`。

- [ ] **Step 1: Write failing contract tests**

在 `packages/contracts/src/classroom.test.ts` 写入：

```ts
import { describe, expect, it } from "vitest";
import {
  classroomSnapshotSchema,
  createHelpRequestSchema,
  classroomControlInputSchema,
} from "./classroom";

describe("classroom contracts", () => {
  it("accepts a live snapshot with a running stage", () => {
    expect(classroomSnapshotSchema.parse({
      session: { id: "class-1", courseWorldId: "course-world-1", dayId: "day-1", status: "live", version: 3 },
      currentStage: { id: "stage-1", title: "个人实践", description: "完成今日切片", sortOrder: 1, durationSeconds: 1800, extensionSeconds: 300, status: "running", version: 2, startedAt: "2026-07-12T09:00:00.000Z", pausedAt: null, accumulatedPauseSeconds: 0 },
      stages: [],
      helpRequests: [],
      serverNow: "2026-07-12T09:10:00.000Z",
    })).toMatchObject({ session: { status: "live" } });
  });

  it("rejects a help request without a non-empty message", () => {
    expect(() => createHelpRequestSchema.parse({ sessionId: "class-1", category: "blocked", message: "" })).toThrow();
  });

  it("requires the expected version for a control action", () => {
    expect(() => classroomControlInputSchema.parse({ action: "pause" })).toThrow();
  });
});
```

- [ ] **Step 2: Run the contract test and verify it fails**

Run: `pnpm --filter contracts exec vitest run src/classroom.test.ts`

Expected: FAIL because `classroom.ts` and its schemas do not exist.

- [ ] **Step 3: Implement the shared schemas**

Add the enums and schemas with strict validation. Use `z.enum` for statuses, `z.string().min(1)` for IDs, `z.string().trim().min(1).max(2000)` for help text, and `z.number().int().nonnegative()` for durations and versions. Export inferred types and re-export them from `packages/contracts/src/index.ts`.

- [ ] **Step 4: Run the contract test and package build**

Run: `pnpm --filter contracts exec vitest run src/classroom.test.ts`

Expected: 3 tests pass.

Run: `pnpm --filter contracts build`

Expected: TypeScript emits `dist` without errors.

- [ ] **Step 5: Lock the database shape before adding API logic**

Add `ClassroomStageStatus`, `ClassroomSessionStatus`, `ClassroomStaffRole`, `HelpRequestStatus` and `ClassroomEventType` to `schema.prisma`. Add the five models and relations described in the approved spec, including indexes on `(sessionId, sortOrder)`, `(sessionId, status, createdAt)`, and `(sessionId, createdAt)`.

Extend `database-shape.spec.ts` with assertions that the schema contains `model ClassroomSession`, `model ClassroomStage`, `model ClassroomStaffAssignment`, `model HelpRequest`, `model ClassroomEvent`, and the five enums.

- [ ] **Step 6: Run the database-shape test to verify the new shape**

Run: `pnpm --filter api exec vitest run test/contracts/database-shape.spec.ts`

Expected: PASS after Prisma schema parsing succeeds; if the test database is missing, fix only the test database setup before continuing.

- [ ] **Step 7: Add a readable classroom seed snapshot**

Extend `seedScenario` with one draft classroom session for `course-world-1`/`day-1`, four ordered stages (`讲解`, `个人实践`, `互测`, `提交`), one teacher assignment, and one student assistant assignment. Export these values through the existing `seedDatabase(prisma)` path so API integration tests can reuse them.

- [ ] **Step 8: Generate Prisma and run the focused checks**

Run: `pnpm --filter api exec prisma format`

Expected: schema formats without validation errors.

Run: `pnpm --filter api exec prisma generate`

Expected: Prisma client generation succeeds.

Run: `pnpm --filter contracts test && pnpm --filter api exec vitest run test/contracts/database-shape.spec.ts`

Expected: contract tests and database-shape tests pass.

- [ ] **Step 9: Commit**

```bash
git add packages/contracts/src/classroom.ts packages/contracts/src/classroom.test.ts packages/contracts/src/index.ts apps/api/prisma/schema.prisma apps/api/prisma/seed.ts apps/api/test/contracts/database-shape.spec.ts
git commit -m "feat: add classroom control data contracts"
```

### Task 2: 课堂场次与阶段控制 API

**Files:**
- Create: `apps/api/src/modules/classrooms/classrooms.module.ts`
- Create: `apps/api/src/modules/classrooms/classrooms.service.ts`
- Create: `apps/api/src/modules/classrooms/classrooms.controller.ts`
- Create: `apps/api/test/classroom-flow.spec.ts`
- Modify: `apps/api/src/app.module.ts`

**Interfaces:**
- `ClassroomsService.createSession(user, input): Promise<ClassroomSnapshot>`
- `ClassroomsService.getSnapshot(sessionId, user): Promise<ClassroomSnapshot>`
- `ClassroomsService.getActiveSnapshot(user): Promise<ClassroomSnapshot | null>`
- `ClassroomsService.startStage(stageId, expectedVersion, user): Promise<ClassroomSnapshot>`
- `ClassroomsService.pauseStage(stageId, expectedVersion, user): Promise<ClassroomSnapshot>`
- `ClassroomsService.extendStage(stageId, seconds, expectedVersion, user): Promise<ClassroomSnapshot>`
- `ClassroomsService.completeStage(stageId, expectedVersion, user): Promise<ClassroomSnapshot>`
- `ClassroomsService.endStageEarly(stageId, expectedVersion, user): Promise<ClassroomSnapshot>`
- `ClassroomsService.unlockNextStage(stageId, expectedVersion, user): Promise<ClassroomSnapshot>`

- [ ] **Step 1: Write the failing API flow test**

In `apps/api/test/classroom-flow.spec.ts`, use `prepareTestDatabase("classroom-flow")`, `AppModule`, and `request(app.getHttpServer())`. Add helpers `loginAs(email, password)`, `getSeededSession(token)` (GET `/classrooms/sessions/classroom-session-1` and return `response.body`), and `teacherToken`/`studentToken`; derive `stageId` from `getSeededSession(teacherToken).stages[0].id`. Cover the seeded snapshot, `GET /classrooms/sessions/active`, and:

```ts
it("lets the teacher start, pause, extend, complete, and unlock the next stage", async () => {
  const snapshot = await getSeededSession(teacherToken);
  const start = await request(app.getHttpServer())
    .post(`/classrooms/stages/${snapshot.stages[0].id}/start`)
    .set("Authorization", `Bearer ${teacherToken}`)
    .send({ expectedVersion: snapshot.stages[0].version });

  expect(start.status).toBe(201);
  expect(start.body.currentStage.status).toBe("running");

  const paused = await request(app.getHttpServer())
    .post(`/classrooms/stages/${snapshot.stages[0].id}/pause`)
    .set("Authorization", `Bearer ${teacherToken}`)
    .send({ expectedVersion: start.body.currentStage.version });
  expect(paused.body.currentStage.status).toBe("paused");
});

it("rejects student and assistant accounts from stage control", async () => {
  const response = await request(app.getHttpServer())
    .post(`/classrooms/stages/${stageId}/start`)
    .set("Authorization", `Bearer ${studentToken}`)
    .send({ expectedVersion: 0 });
  expect(response.status).toBe(403);
});

it("rejects stale expectedVersion with 409", async () => {
  const response = await request(app.getHttpServer())
    .post(`/classrooms/stages/${stageId}/pause`)
    .set("Authorization", `Bearer ${teacherToken}`)
    .send({ expectedVersion: 0 });
  expect(response.status).toBe(409);
});

it("lets the teacher create a new draft session with ordered stages", async () => {
  const response = await request(app.getHttpServer())
    .post("/classrooms/sessions")
    .set("Authorization", `Bearer ${teacherToken}`)
    .send({ courseWorldId: "course-world-1", dayId: "day-2", stages: [{ title: "讲解", durationSeconds: 600 }] });
  expect(response.status).toBe(201);
  expect(response.body.session.status).toBe("draft");
  expect(response.body.stages[0].sortOrder).toBe(0);
});
```

- [ ] **Step 2: Run the focused API test to verify it fails**

Run: `pnpm --filter api exec vitest run test/classroom-flow.spec.ts`

Expected: FAIL with 404/unregistered routes because `ClassroomsModule` does not exist.

- [ ] **Step 3: Implement DTOs, module registration, and snapshot mapping**

In `classrooms.controller.ts`, define class-validator DTOs for `expectedVersion`, `seconds`, session creation, stage creation, and the active-session query. Add `GET /classrooms/sessions/active` before `GET /classrooms/sessions/:id` so the static route is not captured as an ID. Protect the controller with `AuthGuard`; read the current user with `CurrentUser`.

In `classrooms.module.ts`, provide `ClassroomsService` and import `PrismaModule`/`RealtimeModule` only if the existing gateway module boundary requires it. Register the module in `AppModule`.

In `classrooms.service.ts`, centralize:

```ts
type ClassroomActor = { id: string; role: UserRole; displayName: string };
type StageAction = "start" | "pause" | "extend" | "complete" | "end_early" | "unlock_next";
```

`getSnapshot` and `getActiveSnapshot` must derive `viewer.role`, `canControlStages`, and `canHandleHelp` from the current user and `ClassroomStaffAssignment`; an assigned student assistant receives `assistant`/`false`/`true`, while an unassigned student receives `student`/`false`/`false`.

The service must load the session, verify the actor is the assigned teacher, validate the stage transition, update the stage/session version, create `ClassroomEvent`, and return `getSnapshot` from the same transaction. Compute `serverNow` with `new Date().toISOString()` at response time.

- [ ] **Step 4: Implement server-side timer calculation**

Add a pure helper in `classrooms.service.ts`:

```ts
function getRemainingSeconds(stage: {
  status: "draft" | "running" | "paused" | "completed" | "ended_early";
  durationSeconds: number;
  extensionSeconds: number;
  startedAt: Date | null;
  pausedAt: Date | null;
  accumulatedPauseSeconds: number;
}, now: Date): number | null
```

Return `null` for `draft`; for `running`, subtract elapsed active seconds and pause accumulation from duration plus extension; for `paused`, freeze at the value calculated at `pausedAt`; never return below zero.

- [ ] **Step 5: Run the API flow and build checks**

Run: `pnpm --filter api exec vitest run test/classroom-flow.spec.ts`

Expected: stage lifecycle, 403 and 409 tests pass.

Run: `pnpm --filter api build`

Expected: Nest build succeeds with no DTO or Prisma type errors.

- [ ] **Step 6: Verify event persistence**

Add an assertion after a stage transition:

```ts
const event = await prisma.classroomEvent.findFirstOrThrow({
  where: { sessionId: snapshot.session.id, eventType: "stage_started" },
});
expect(event.actorId).toBe("teacher-1");
expect(event.targetId).toBe(snapshot.stages[0].id);
```

Run the same focused API test and confirm the event is written in the same flow.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/classrooms apps/api/src/app.module.ts apps/api/test/classroom-flow.spec.ts
git commit -m "feat: add classroom stage control api"
```

### Task 3: 求助队列与课堂内助教权限

**Files:**
- Modify: `apps/api/src/modules/classrooms/classrooms.service.ts`
- Modify: `apps/api/src/modules/classrooms/classrooms.controller.ts`
- Modify: `apps/api/test/classroom-flow.spec.ts`
- Modify: `apps/api/src/modules/rooms/rooms.service.ts` only where an existing room authorization helper must be reused

**Interfaces:**
- `ClassroomsService.listHelpRequests(sessionId, user): Promise<HelpRequest[]>`
- `ClassroomsService.createHelpRequest(input, user): Promise<HelpRequest>`
- `ClassroomsService.claimHelpRequest(helpRequestId, user): Promise<HelpRequest>`
- `ClassroomsService.resolveHelpRequest(helpRequestId, resolutionNote, user): Promise<HelpRequest>`
- `ClassroomsService.cancelHelpRequest(helpRequestId, user): Promise<HelpRequest>`

- [ ] **Step 1: Write failing help-flow tests**

Extend `classroom-flow.spec.ts` with `assistantToken = loginAs("kai@academy.test", "student-pass-789")` from the seeded assistant assignment, and `createOpenHelpRequest(token)`, which posts `{ sessionId, category: "blocked", message: "环境变量没有加载" }` and returns the response body, then add:

```ts
it("lets a student create and cancel an open help request", async () => {
  const created = await request(app.getHttpServer())
    .post("/classrooms/help-requests")
    .set("Authorization", `Bearer ${studentToken}`)
    .send({ sessionId, category: "blocked", message: "环境变量没有加载" });
  expect(created.status).toBe(201);
  expect(created.body).toMatchObject({ status: "open", studentId: "student-1" });

  const cancelled = await request(app.getHttpServer())
    .post(`/classrooms/help-requests/${created.body.id}/cancel`)
    .set("Authorization", `Bearer ${studentToken}`);
  expect(cancelled.body.status).toBe("cancelled");
});

it("allows the assigned student assistant to claim and resolve help exactly once", async () => {
  const first = await createOpenHelpRequest(studentToken);
  const claim = await request(app.getHttpServer())
    .post(`/classrooms/help-requests/${first.id}/claim`)
    .set("Authorization", `Bearer ${assistantToken}`);
  expect(claim.body.status).toBe("claimed");

  const competingClaim = await request(app.getHttpServer())
    .post(`/classrooms/help-requests/${first.id}/claim`)
    .set("Authorization", `Bearer ${teacherToken}`);
  expect(competingClaim.status).toBe(409);
});

it("writes help_created, help_claimed, and help_resolved events", async () => {
  // create, claim, resolve one request, then assert ordered eventType values
});
```

- [ ] **Step 2: Run the focused help tests and verify failure**

Run: `pnpm --filter api exec vitest run test/classroom-flow.spec.ts -t "help"`

Expected: FAIL with 404 or missing service methods.

- [ ] **Step 3: Implement help request creation and listing**

Require an authenticated student for creation, verify the student belongs to the classroom world, trim and validate the message, create `HelpRequest` and `ClassroomEvent` in one transaction, and return the normalized contract payload. List requests only for the session teacher, assigned assistants, or the requesting student.

- [ ] **Step 4: Implement claim/resolve/cancel transitions**

Use a conditional update for claim:

```ts
await prisma.helpRequest.updateMany({
  where: { id: helpRequestId, status: "open", assigneeId: null },
  data: { status: "claimed", assigneeId: user.id, claimedAt: new Date(), version: { increment: 1 } },
});
```

If the affected row count is zero, reload and return `409`. Only the assigned assistant, classroom teacher, or request owner according to the state rules may resolve/cancel. Persist `resolutionNote` and the corresponding immutable event.

- [ ] **Step 5: Reuse existing room access checks**

When resolving a help request into “enter student room”, return the existing room identifier and route the UI through existing `RoomsService`/access-grant rules. Do not add a bypass in the classroom controller.

- [ ] **Step 6: Run API tests and build**

Run: `pnpm --filter api exec vitest run test/classroom-flow.spec.ts`

Expected: stage and help flows pass, including concurrent-claim `409` and event persistence.

Run: `pnpm --filter api build`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/classrooms apps/api/test/classroom-flow.spec.ts apps/api/src/modules/rooms/rooms.service.ts
git commit -m "feat: add classroom help queue"
```

### Task 4: 课堂实时频道与降级事件

**Files:**
- Modify: `apps/api/src/modules/realtime/realtime.gateway.ts`
- Modify: `apps/api/test/realtime.spec.ts`
- Modify: `apps/api/src/modules/classrooms/classrooms.service.ts`

**Interfaces:**
- Gateway handlers: `classroom:subscribe` and `classroom:unsubscribe` with `{ sessionId: string }`.
- `RealtimeGateway.broadcastClassroomStageUpdate(payload: ClassroomStageUpdatePayload): void`.
- `RealtimeGateway.broadcastClassroomHelpUpdate(payload: ClassroomHelpUpdatePayload): void`.

- [ ] **Step 1: Write failing gateway tests**

Add tests with a Socket.IO room mock:

```ts
it("broadcasts stage updates to the classroom room", () => {
  const gateway = new RealtimeGateway({} as never);
  const emit = vi.fn();
  gateway.server = { to: vi.fn().mockReturnValue({ emit }) } as never;

  gateway.broadcastClassroomStageUpdate({ sessionId: "class-1", version: 4, status: "running", serverNow: "2026-07-12T09:00:00.000Z" });

  expect(gateway.server.to).toHaveBeenCalledWith("classroom:class-1");
  expect(emit).toHaveBeenCalledWith("classroom:stage:update", expect.objectContaining({ version: 4 }));
});
```

Also test that subscription rejects an empty session ID and joins `classroom:<sessionId>`.

- [ ] **Step 2: Run the realtime test and verify failure**

Run: `pnpm --filter api exec vitest run test/realtime.spec.ts -t "classroom"`

Expected: FAIL because classroom handlers and broadcasters are missing.

- [ ] **Step 3: Implement room-scoped broadcast methods**

Add typed payloads containing `sessionId`, `version`, `serverNow`, and only the fields needed by the UI. Use `this.server.to(`classroom:${sessionId}`).emit(...)`; do not use global `server.emit` for classroom events.

- [ ] **Step 4: Implement authenticated classroom subscription**

Verify the connected user has a classroom assignment or is the student whose active session is being displayed before `client.join`. Return `{ error: "forbidden" }` for unrelated sessions. Leave existing chat and zone subscription behavior unchanged.

- [ ] **Step 5: Trigger broadcasts after successful transactions**

In `ClassroomsService`, call the gateway only after the transaction returns the new snapshot. If the gateway call throws, log it and still return the persisted snapshot. Broadcast stage updates after every stage transition and help updates after create/claim/resolve/cancel.

- [ ] **Step 6: Run realtime and API tests**

Run: `pnpm --filter api exec vitest run test/realtime.spec.ts -t "classroom"`

Expected: PASS.

Run: `pnpm --filter api exec vitest run test/classroom-flow.spec.ts`

Expected: Existing REST flows remain PASS with broadcasts mocked or safely ignored.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/realtime/realtime.gateway.ts apps/api/src/modules/classrooms/classrooms.service.ts apps/api/test/realtime.spec.ts
git commit -m "feat: broadcast classroom realtime updates"
```

### Task 5: Web API client与老师课堂指挥台

**Files:**
- Modify: `apps/web/src/lib/api-client.ts`
- Modify: `apps/web/src/lib/api-client.test.ts`
- Create: `apps/web/src/components/classroom/classroom-control-panel.tsx`
- Create: `apps/web/src/components/classroom/classroom-control-panel.test.tsx`
- Create: `apps/web/src/components/classroom/help-queue.tsx`
- Create: `apps/web/src/components/classroom/help-queue.test.tsx`
- Modify: `apps/web/src/app/teacher/page.tsx`
- Modify: `apps/web/src/app/teacher/page.test.tsx`

**Interfaces:**
- API client reads: `getClassroomSnapshot(sessionId, token)`, `getActiveClassroom(token)`, `getActiveClassroomSafe(token)`, `getHelpRequests(sessionId, token)`, `getHelpRequestsSafe(sessionId, token)`.
- API client writes: `startClassroomStage(stageId, expectedVersion, token)`, `pauseClassroomStage(stageId, expectedVersion, token)`, `extendClassroomStage(stageId, seconds, expectedVersion, token)`, `completeClassroomStage(stageId, expectedVersion, token)`, `unlockNextClassroomStage(stageId, expectedVersion, token)`, `createHelpRequest(input, token)`, `claimHelpRequest(helpRequestId, token)`, `resolveHelpRequest(helpRequestId, resolutionNote, token)`.
- `ClassroomControlPanel` consumes `{ snapshot, token }` and emits no business callbacks; it owns write state and renders feedback.
- `HelpQueue` consumes `{ sessionId, requests, token, canHandleHelp }` and renders claim/resolve actions.

- [ ] **Step 1: Write failing api-client tests**

Add tests asserting exact URL, `Authorization`, `Content-Type`, `method`, JSON body and `cache: "no-store"` for `getActiveClassroom`, `pauseClassroomStage`, `extendClassroomStage`, and `claimHelpRequest`. Add a rejected-fetch test for `getActiveClassroomSafe` returning `{ data: emptyClassroomSnapshot, degraded: true }`.

- [ ] **Step 2: Run focused Web client tests and verify failure**

Run: `pnpm --filter web exec vitest run src/lib/api-client.test.ts -t "classroom"`

Expected: FAIL because the client methods are missing.

- [ ] **Step 3: Implement the API client methods**

Follow the existing `fetchJson`/safe-wrapper style in `apps/web/src/lib/api-client.ts`. Keep strict methods throwing for non-2xx responses and safe methods returning explicit `degraded` state. Send `expectedVersion` on every stage mutation.

- [ ] **Step 4: Write failing control panel tests**

In `classroom-control-panel.test.tsx`, mock the API client and assert:

```tsx
it("renders the active stage and sends a pause with the current version", async () => {
  render(<ClassroomControlPanel snapshot={snapshot} token="session_teacher-1" />);
  expect(screen.getByText("个人实践")).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "暂停" }));
  expect(pauseClassroomStage).toHaveBeenCalledWith("stage-1", 2, "session_teacher-1");
});
```

Test extension buttons, optimistic loading/feedback, `409` refresh message, and the read-only state for assistant users.

- [ ] **Step 5: Implement control panel and help queue**

The control panel displays the server `serverNow`/stage timestamps through a one-second local display tick, but writes only through API methods. Disable controls while a request is pending; on `409`, show “课堂状态已更新，请刷新课堂快照” and invoke the safe snapshot refresh path.

The help queue sorts `open` first, then by `createdAt`, renders waiting time, and exposes claim/resolve only when `canControl` is true. Resolve requires a non-empty note only if the teacher chooses to record one; successful mutation updates the local item and summary without fabricating server counts.

- [ ] **Step 6: Integrate server-side teacher page reads and assistant access**

In `TeacherPage`, request `getActiveClassroomSafe(session.token)` before the role gate. Allow the page for a normal teacher or a user whose classroom snapshot has `viewer.role === "assistant"`; keep unassigned students blocked. Request `getHelpRequestsSafe(...)` in the existing `Promise.all`, render the control panel only when `viewer.canControlStages`, and render the help queue when `viewer.canHandleHelp`. Render a visible degraded banner when classroom data is unavailable, while preserving the current Day/insight/review sections. Pass only serializable snapshot data and token to client components.

- [ ] **Step 7: Run Web component/page tests and build**

Run: `pnpm --filter web exec vitest run src/lib/api-client.test.ts -t "classroom" src/components/classroom/classroom-control-panel.test.tsx src/components/classroom/help-queue.test.tsx src/app/teacher/page.test.tsx`

Expected: all new classroom assertions pass; existing failures unrelated to classroom must be reported separately rather than hidden.

Run: `pnpm --filter web build`

Expected: Next.js type-check and production build succeed.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/lib/api-client.ts apps/web/src/lib/api-client.test.ts apps/web/src/components/classroom apps/web/src/app/teacher/page.tsx apps/web/src/app/teacher/page.test.tsx
git commit -m "feat: add teacher classroom control panel"
```

### Task 6: 学生课堂状态条、举手求助与 WebSocket 降级

**Files:**
- Create: `apps/web/src/components/classroom/student-classroom-banner.tsx`
- Create: `apps/web/src/components/classroom/student-classroom-banner.test.tsx`
- Create: `apps/web/src/components/classroom/classroom-socket.ts`
- Modify: `apps/web/src/components/world/world-shell.tsx`
- Modify: `apps/web/src/components/world/world-shell.test.tsx`
- Modify: `apps/web/src/app/chat/page.tsx`
- Modify: `apps/web/src/app/chat/page.test.tsx`

**Interfaces:**
- `StudentClassroomBanner` consumes `{ snapshot, token, studentId }` and calls `createHelpRequest({ sessionId, category, message }, token)`.
- `createClassroomSocket({ token, sessionId, onStageUpdate, onHelpUpdate, onConnectionState })` returns `{ disconnect }`.
- Socket handlers must ignore payloads with `payload.version < currentVersion`.

- [ ] **Step 1: Write failing student component tests**

Assert that a running stage shows its title and a time label, a paused stage shows “已暂停”, clicking “举手求助” reveals category/message controls, and submitting calls the API with the current `sessionId`.

```tsx
it("lets a student raise a help request for the active classroom", async () => {
  render(<StudentClassroomBanner snapshot={snapshot} token="session_student-1" studentId="student-1" />);
  await userEvent.click(screen.getByRole("button", { name: "举手求助" }));
  await userEvent.type(screen.getByLabelText("问题描述"), "我不知道下一步怎么做");
  await userEvent.click(screen.getByRole("button", { name: "提交求助" }));
  expect(createHelpRequest).toHaveBeenCalledWith({ sessionId: "class-1", category: "question", message: "我不知道下一步怎么做" }, "session_student-1");
});
```

- [ ] **Step 2: Run the focused component tests and verify failure**

Run: `pnpm --filter web exec vitest run src/components/classroom/student-classroom-banner.test.tsx`

Expected: FAIL because the component and socket helper do not exist.

- [ ] **Step 3: Implement the student status bar**

Render current Day, stage target, server-derived countdown, connection badge, current request status, and a modal/inline form. On API failure show a visible safe-empty message; do not silently invent an active stage.

- [ ] **Step 4: Implement the classroom Socket.IO helper**

Use the existing `socket.io-client` dependency and derive the API host with the same `getWsUrl` convention as `WorldShell`. On connect emit `classroom:subscribe` with `sessionId`; listen for `classroom:stage:update` and `classroom:help:update`; expose `connecting | connected | disconnected` to the component. Keep reconnect attempts bounded and let REST polling remain authoritative.

- [ ] **Step 5: Mount in the world and chat pages**

In `WorldShell`, load the active classroom snapshot using the browser session token, mount `StudentClassroomBanner` above the Phaser canvas for student accounts, and refresh the snapshot on socket updates. In `chat/page.tsx`, reuse the same banner data for students/authorized guests without duplicating classroom business logic.

- [ ] **Step 6: Run Web tests and build**

Run: `pnpm --filter web exec vitest run src/components/classroom/student-classroom-banner.test.tsx src/components/world/world-shell.test.tsx src/app/chat/page.test.tsx`

Expected: new banner, socket and page assertions pass.

Run: `pnpm --filter web build`

Expected: PASS with client/server boundaries serializable.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/components/classroom/student-classroom-banner.tsx apps/web/src/components/classroom/student-classroom-banner.test.tsx apps/web/src/components/classroom/classroom-socket.ts apps/web/src/components/world/world-shell.tsx apps/web/src/components/world/world-shell.test.tsx apps/web/src/app/chat/page.tsx apps/web/src/app/chat/page.test.tsx
git commit -m "feat: add student classroom status and help"
```

### Task 7: 浏览器闭环、复盘基础与交付验证

**Files:**
- Create: `apps/web/tests/e2e/classroom-flow.spec.ts`
- Modify: `apps/web/playwright.config.ts` only if classroom test needs an explicit API base URL or seeded test command
- Modify: `README.md` — document classroom seed, test commands, and the 3000/3001/3100 port split.
- Modify: `.gitignore` only if classroom E2E introduces a new generated artifact.

**Interfaces:**
- E2E relies on the stable HTTP routes from Tasks 2–3 and the existing seeded accounts: teacher, student-1, and the seeded student assistant assignment.

- [ ] **Step 1: Write the failing Playwright smoke flow**

Create a test that uses relative routes and the configured `baseURL`:

```ts
import { test, expect, type Page } from "@playwright/test";

async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("邮箱").fill(email);
  await page.getByLabel("密码").fill(password);
  await page.getByRole("button", { name: "登录" }).click();
}

test("teacher advances a classroom and an assistant resolves student help", async ({ page, browser }) => {
  await login(page, "teacher@academy.test", "teacher-pass-123");
  await page.goto("/teacher");
  await page.getByRole("button", { name: "开始" }).click();
  await expect(page.getByText("个人实践")).toBeVisible();

  const student = await browser.newPage();
  await login(student, "lin@academy.test", "student-pass-123");
  await student.goto("/");
  await expect(student.getByText(/个人实践|课堂/)).toBeVisible();
  await student.getByRole("button", { name: "举手求助" }).click();
  await student.getByLabel("问题描述").fill("课堂 E2E 求助");
  await student.getByRole("button", { name: "提交求助" }).click();

  const assistant = await browser.newPage();
  await login(assistant, "kai@academy.test", "student-pass-789");
  await assistant.goto("/teacher");
  await expect(assistant.getByText("课堂 E2E 求助")).toBeVisible();
  await assistant.getByRole("button", { name: "认领" }).click();
  await assistant.getByRole("button", { name: "标记解决" }).click();
  await expect(student.getByText(/已解决|已处理/)).toBeVisible();
});
```

- [ ] **Step 2: Run the smoke test and verify the expected pre-implementation failure**

Run: `pnpm --filter web exec playwright test tests/e2e/classroom-flow.spec.ts`

Expected before implementation: FAIL because the classroom controls and status bar are absent. Do not treat a missing browser binary as a feature failure; install with `pnpm --filter web exec playwright install chromium` if needed.

- [ ] **Step 3: Implement only test-environment support needed for deterministic data**

Ensure the E2E server uses port 3100, the API uses port 3001, and the test data is initialized through the repository’s existing seed path. Do not add a second test-only classroom implementation or hard-code classroom state in the page.

- [ ] **Step 4: Run the full classroom verification set**

Run in order:

```bash
pnpm --filter contracts test
pnpm --filter api exec vitest run test/contracts/database-shape.spec.ts test/classroom-flow.spec.ts test/realtime.spec.ts
pnpm --filter web exec vitest run src/lib/api-client.test.ts src/components/classroom src/app/teacher/page.test.tsx src/app/chat/page.test.tsx
pnpm --filter api build
pnpm --filter web build
pnpm test:e2e -- tests/e2e/classroom-flow.spec.ts
```

Expected: the classroom-specific tests and both application builds pass. Record any pre-existing unrelated failures separately; do not claim the whole repository is green unless `pnpm test` also passes.

- [ ] **Step 5: Add the runbook**

Document the classroom seed and verification commands in `README.md`, including that Web development is `3000`, API is `3001`, and Playwright owns `3100`. Mention that Redis is not required for the classroom stage/help flow.

- [ ] **Step 6: Commit the verified delivery**

```bash
git add apps/web/tests/e2e/classroom-flow.spec.ts apps/web/playwright.config.ts README.md .gitignore
git commit -m "test: verify classroom control center flow"
```

## Self-review checklist

- Spec coverage: database shape is Task 1; stage lifecycle and permissions are Task 2; help lifecycle and assistant access are Task 3; realtime and fallback are Task 4/6; teacher UI is Task 5; student UI is Task 6; browser flow and runbook are Task 7.
- Placeholder scan: no task relies on unfinished markers, an unspecified file, or an unnamed helper.
- Type consistency: shared contract names are defined in Task 1 and reused by API, gateway, and Web tasks; `expectedVersion` is used consistently by all stage mutations.
- Environment consistency: all API integration tests use `prepareTestDatabase`, Web E2E uses 3100, API uses 3001, and development Web uses 3000.
- Scope check: the plan excludes multi-class scheduling, recording, complex analytics, and global assistant roles as required by the approved design.
