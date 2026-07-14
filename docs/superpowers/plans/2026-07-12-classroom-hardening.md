# Classroom Hardening Implementation Plan

> **For agentic workers:** Execute this plan inline with TDD checkpoints.

**Goal:** 修复课堂控制中心在实时认证、聊天室授权、阶段状态、评审统计、会话安全和本地验收数据方面的高优先级问题。

**Architecture:** 后端继续作为课堂真相源，Socket 复用 AuthService 的 token hash 校验并通过 ChatService 做房间授权；前端只根据后端状态机渲染可用操作。开发、E2E 和 Redis 不可用时分别使用隔离数据库与明确的降级模式。

**Tech Stack:** NestJS、Prisma/SQLite、Socket.IO、Next.js App Router、React、Vitest、Playwright。

## Global Constraints

- 不删除用户已有的无关工作区改动。
- 每个修复先写失败测试，再写最小实现。
- 课堂和聊天权限必须以后端校验为准，不能只依赖前端按钮隐藏。
- 不把 E2E 测试数据写入开发数据库。

### Task 1: Realtime authentication and chat room authorization

**Files:**
- Modify: `apps/api/src/modules/realtime/realtime.gateway.ts`
- Modify: `apps/api/src/modules/chat/chat.service.ts`
- Test: `apps/api/test/realtime.spec.ts`
- Test: `apps/api/test/chat-access.spec.ts`

- [ ] 写测试：连接握手使用登录返回的原始 token 时应通过 hash 查询；无权限学生订阅别人的 chat room 应返回 forbidden；教师和有授权协作者应能订阅。
- [ ] 运行定向 realtime/chat 测试确认当前实现失败。
- [ ] 让 gateway 调用 AuthService 的 hash 校验，并为 chat:subscribe 增加 room viewer role 检查。
- [ ] 重新运行定向测试并保持课堂订阅行为不变。

### Task 2: Classroom state machine and review semantics

**Files:**
- Modify: `apps/api/src/modules/classrooms/classrooms.service.ts`
- Modify: `apps/web/src/components/classroom/classroom-control-panel.tsx`
- Modify: `apps/web/src/components/classroom/student-classroom-banner.tsx`
- Modify: `apps/api/src/modules/reviews/reviews.controller.ts`
- Modify: `apps/web/src/lib/api-client.ts`
- Modify: `apps/web/src/components/teacher/review-queue.tsx`
- Test: `apps/api/test/classroom-flow.spec.ts`
- Test: `apps/api/test/review-queue.spec.ts`
- Test: `apps/web/src/components/classroom/classroom-control-panel.test.tsx`
- Test: `apps/web/src/components/teacher/review-queue.test.tsx`

- [ ] 写测试：计时耗尽返回 expired/可完成状态；暂停阶段可恢复；draft 阶段不能完成或解锁；评审统计区分 queued 与待老师裁定。
- [ ] 运行定向测试确认红灯。
- [ ] 实现后端的有效状态派生和前端按钮矩阵，补齐提前结束入口。
- [ ] 将 review summary 字段拆分为语义明确的统计并同步页面。
- [ ] 重新运行 API/Web 定向测试。

### Task 3: Session and artifact safety

**Files:**
- Modify: `apps/web/src/lib/session.ts`
- Modify: `apps/web/src/app/login/page.tsx`
- Modify: `apps/api/src/modules/submissions/submissions.controller.ts`
- Modify: `apps/web/src/components/chat/chat-room.tsx`
- Test: `apps/web/src/lib/session.test.ts`
- Test: `apps/api/test/submission-flow.spec.ts`

- [ ] 写测试：生产 cookie 必须 HttpOnly/SameSite/Secure；提交工件链接必须指向真实可访问的 API 路由或被明确标记为外部链接。
- [ ] 运行定向测试确认红灯。
- [ ] 将会话写入收口到服务端 cookie，浏览器只保留非敏感展示快照；补充工件访问契约。
- [ ] 重新运行定向测试与构建。

### Task 4: Isolated verification and Redis degradation

**Files:**
- Modify: `apps/web/playwright.config.ts`
- Modify: `apps/web/package.json`
- Modify: `apps/api/src/modules/queue/review.processor.ts`
- Create: `scripts/reset-dev-db.sh`
- Test: `apps/web/playwright.config.test.ts`

- [ ] 写配置测试：E2E 使用独立数据库/服务启动入口，不能复用开发数据库。
- [ ] 运行测试确认红灯。
- [ ] 增加可重复的 dev reset 命令，E2E 启动时使用专用 DATABASE_URL；Redis 不可用时只记录一次降级状态并走直接处理。
- [ ] 运行定向测试、API/Web build、课堂 E2E 和 `git diff --check`。
