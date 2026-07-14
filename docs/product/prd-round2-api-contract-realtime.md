# PRD Round 2: API 契约与实时通信系统修复

> 版本: 2.0 | 作者: 产品官 Eric | 日期: 2026-07-08
> 关联文档: `docs/product/prd-api-error-handling-and-ai-experience.md`、`docs/product/prd-realtime-and-ui-experience.md`
> 本 PRD 基于 Phase 1 审查的 31 项问题（A-001~A-018、R-004~R-024、F-004~F-025、H-001~H-007），将每个修复原子化为可独立执行的最小步骤。

## 目录
1. 问题概述（按严重程度分组）
2. 市面产品分析
3. 方案对比
4. 推荐方案
5. 原子化实施步骤

## 1. 问题概述（按严重程度分组）

### 1.1 P0 — 阻断性（必须立即修复）

| 编号 | 问题 | 证据位置 |
|------|------|----------|
| A-001 | Swagger 仅有 title/description，所有控制器无 @ApiProperty/@ApiResponse，大量端点用内联 type 而非 class DTO，Swagger 无法推断请求体结构 | `apps/api/src/main.ts:21-26`；`chat.controller.ts:18-21`(type)；`npc-conversation.controller.ts:16-26`(type) |
| R-004 / A-005 | WebSocket `broadcastNewMessage` 使用 `server.emit()` 向所有客户端广播，无房间隔离，聊天消息跨房间泄露 | `realtime.gateway.ts:34-43` `this.server.emit("chat:message", message)` |
| H-001 | 聊天室页面 `main` 缺少 `data-scrollable`，内容超出视口无法滚动 | `apps/web/src/app/chat/page.tsx:210` `<main style={pageStyle}>` 无 data-scrollable |

### 1.2 P1 — 高优先级

| 编号 | 问题 | 证据位置 |
|------|------|----------|
| A-002 | API 后端完全未引用共享 contracts 包，契约与实现脱节 | 全代码库 `import ... contracts` 0 匹配；`packages/contracts/src/index.ts` 存在但未被消费 |
| A-004 | 所有列表接口无分页，聊天消息硬编码 `take:50` | `chat.service.ts:103` `take: 50` |
| A-006 | WebSocket 事件名/payload/认证方式完全未文档化 | `realtime.gateway.ts` 事件 `presence:update`/`agent-status:update`/`chat:message`，auth 用 `handshake.auth.token`，无文档 |
| A-016 | chat/rooms/quests/npc/WebSocket 缺少共享契约定义 | `contracts/src/index.ts` 仅含 auth/world/guilds/submissions/reviews/memory/agent-avatar/learning-insight/teaching-agent |
| R-006 | 教师房间概览查询全量消息无 limit，内存溢出风险 | `chat.service.ts:185-193` `getTeacherRoomOverview` findMany 无 take |
| F-004 | 教师视角聊天消息归属错误，学生消息显示为"自己发的" | `chat-room.tsx:313` `currentUserId={studentId}`；`room-messages.tsx:259` `isSelf = message.authorId === currentUserId` |
| H-007 | WebSocket/轮询失败静默处理，用户不知实时功能不可用 | `world-shell.tsx:167-169` catch 静默；`room-messages.tsx:204-206` catch 静默 |

### 1.3 P2 — 中优先级

| 编号 | 问题 | 证据位置 |
|------|------|----------|
| A-008 | 错误消息中英文混杂，机器解析困难 | `reviews.controller.ts:137` "评审记录不存在" vs :142 "Review is not ready" |
| A-009 | 无机器可读错误码，401 无法区分 token 缺失/无效/过期 | `prisma-exception.filter.ts:55-59` 返回 `{statusCode,message,error}` 无 code 字段 |
| A-010 | GET /chat 一端点三种语义（教师列表/学生详情/指定房间），响应结构不统一 | `chat.controller.ts:34-41` getOverview 处理 studentId/roomId/无参数 |
| A-011 | Room ID 格式约定 `room-chat-<studentId>` 未文档化 | `chat.service.ts:289-303` getRoomOwnerId/toRoomId |
| A-013 | NPC 响应类型声明缺少 llmUsed 字段，与实际返回不一致 | 控制器 `npc-conversation.controller.ts:16-21` 无 llmUsed；服务 `npc-conversation.service.ts:7-13` 有 llmUsed |
| R-010 | 教师可在学生房间发消息，与"只读旁观"需求矛盾 | `chat.service.ts:216-218` createMessage 允许 teacher |
| R-013 | 消息查询无分页，超50条后旧消息不可访问 | `chat.service.ts:103` take:50 无分页参数 |
| R-014 | 消息无最大长度限制，请求体用 type 非 class 无验证 | `chat.controller.ts:18-21` CreateChatMessageBody 是 type，无 @IsString/@MaxLength |
| R-024 | 评审列表无分页，深层嵌套 include 性能差 | `reviews.controller.ts:66-87` findMany 无 take/skip，4 层嵌套 include |
| F-016 | RoomMessages currentUserId 默认值硬编码 "student-1" | `room-messages.tsx:172` currentUserId = "student-1"；`chat-room.tsx:165` studentId = "student-1" |
| F-017 | 降级模式下 viewerRole 默认为 owner，guest 误获 owner UI | `api-client.ts:214-219` EMPTY_CHAT_ROOM viewerRole: "owner" 硬编码 |

### 1.4 P3 — 低优先级

| 编号 | 问题 | 证据位置 |
|------|------|----------|
| A-012 | 聊天消息字段名 "body" 与 HTTP body 语义混淆 | `chat.controller.ts:20` body: string；`api-client.ts:130` body: string |
| A-018 | 无专门评审状态轮询端点，需轮询全量列表 | `reviews.controller.ts:60` GET /reviews 返回全量+汇总 |
| F-025 | setTimeout 未在组件卸载时清理 | `room-messages.tsx:245` setTimeout(() => setMessageFeedback(null), 3000) 无清理 |

## 2. 市面产品分析

### 2.1 错误码设计（对应 A-008、A-009）

**Stripe API** — 行业黄金标准。错误响应采用"三层分离"结构：
- HTTP 状态码表示错误类别（401/403/404/409/429...）
- `type` 字段是机器可读枚举（`api_error` / `card_error` / `invalid_request_error` / `idempotency_error`）
- `code` 字段是细粒度短字符串（如 `card_declined`、`parameter_missing`），可程序化分支处理
- `message` 是人类可读文案，可面向终端用户展示
- `param` 指向出错的具体参数，便于前端定位表单字段
- `doc_url` 提供错误码文档链接

关键洞察：Stripe 把"机器判断"（type/code）与"人类阅读"（message）彻底分离，401 仅表示"认证失败"大类，具体原因由 code 区分（`authentication_required` 等）。

**OpenAI API** — 与 Stripe 类似，`error.type` 区分 `invalid_request_error`/`authentication_error`/`rate_limit_exceeded`/`api_error`，401 错误进一步用 message 说明是 API key 无效还是组织不匹配。LLM 场景下还区分 `server_error` 与 `model_not_found`。

**Twilio API** — 用数字 `error.code`（如 20003=认证失败、20404=资源不存在）+ `error.message`，code 是稳定契约，绝不随文案变化。

### 2.2 分页（对应 A-004、R-013、R-024）

**GitHub REST API** — 双模式：cursor-based（`before`/`after`）与 page-based（`page`/`per_page`）。响应头返回 `Link` 头，包含 `rel="prev|next|first|last"` 的 URL，客户端无需自己拼参数。GitHub 已宣布弃用 Dependabot alerts 的 offset 分页（`page`/`first`/`last`），全面转向 cursor-based。

**Stripe API** — cursor-based（`starting_after`/`ending_before` 以对象 ID 为游标）+ 响应体 `has_more` 布尔值 + `next_page` URL。默认 10 条，上限 100 条。

**Slack API** — cursor-based（`cursor` 参数）+ `response_metadata.next_cursor`，空字符串表示已到末尾。强制 `limit` 参数。

关键洞察：三者都偏好 cursor-based（以稳定 ID/时间戳为游标），因为 offset 在数据频繁变动时会产生跳页/重复；`has_more`/`next_cursor` 比计算总页数更可靠。

### 2.3 WebSocket 房间隔离（对应 R-004/A-005、R-010）

**Discord / Slack（Socket.IO Rooms 机制）** — Discord 按 guild/channel 分发消息，绝不全局广播。底层用 Socket.IO 的 Rooms：客户端连接后 `socket.join(channelId)`，服务端推送时 `io.to(channelId).emit("message", payload)`，只有加入了该 room 的 socket 收到事件。离开频道时 `socket.leave(channelId)`。这天然实现了房间隔离。

**Supabase Realtime** — 更进一步用 RLS（行级安全）策略控制谁能访问 Realtime channel。客户端订阅 channel 时，服务端基于用户认证和数据库策略校验授权；未授权的客户端即使知道 channel 名也无法收到消息。授权不依赖客户端自觉，而是服务端强制。

关键洞察：当前项目 `this.server.emit()` 等于 Discord 对所有服务器所有频道广播，必须改为 `this.server.to(roomId).emit()`；且 join 必须服务端校验权限后执行（参考 Supabase），不能让客户端随意 join 任意 roomId。

### 2.4 共享契约（对应 A-002、A-016）

**Zod + nestjs-zod** — 用 Zod schema 作为前后端单一真相源（single source of truth）。`nestjs-zod` 库可从 Zod schema 自动生成 NestJS DTO（替代 class-validator），同时导出 TS 类型供前端消费，并能驱动 Swagger schema 生成。一个 schema 同时满足：运行时校验、TS 类型、OpenAPI 文档三件事。

**OpenAPI codegen** — 以 OpenAPI spec 为契约源，用 `openapi-typescript` 或 `orval` 生成前端类型安全客户端。后端用 `@nestjs/swagger` 生成 spec。缺点是 spec 与后端代码之间仍有一层间接。

关键洞察：本项目已有 `packages/contracts`（含 Zod），但 API 完全未引用。推荐用 Zod 契约驱动一切，避免维护两套类型。

### 2.5 连接状态与降级（对应 H-007、F-017）

**Slack** — 降级模式以"灰色横幅"形式出现在客户端顶部，明确告知"正在以降级模式运行，部分功能不可用"，用户可继续使用基本功能。连接恢复后横幅消失。

**Discord** — 顶部状态指示器持续显示 WebSocket 连接状态（连接中/已连接/重连中/离线），断线时自动指数退避重连，多次失败后切换 REST 轮询兜底，并显式提示用户。

关键洞察：当前项目 catch 块静默吞掉错误，用户无法感知实时功能失效。应显式暴露连接状态，降级时明确提示，而非默默回退到错误的默认值（如 F-017 的 owner）。

### 2.6 API 文档自动生成（对应 A-001、A-006、A-011）

**Stripe / GitHub** — 都提供机器可读的 OpenAPI spec（`/openapi.json`）+ 人类可读的文档站。GitHub 的 REST API 文档每个端点都有 operationId、参数 schema、响应 schema、示例。Stripe 的 spec 可被 SDK 自动消费生成客户端。

关键洞察：当前 Swagger 只有 title/description，DTO 用内联 type 无法推断。需将所有 type 转为带 `@ApiProperty` 的 class（或用 nestjs-zod 自动生成），并补全 `@ApiResponse`。

## 3. 方案对比

### 3.1 错误响应格式

| 方案 | 机器可读性 | 国际化支持 | 实现复杂度 | 现有改动量 |
|------|-----------|-----------|-----------|-----------|
| A. NestJS 默认 `{statusCode,message,error}` | 低（仅 HTTP 码） | 差（消息混杂） | 低 | 无（现状） |
| B. Stripe 式 `{code,type,message,param}` | 高 | 好（code 稳定，message 可 i18n） | 中 | 需统一异常过滤器 + 错误码常量表 |
| C. RFC 7807 Problem Details | 高 | 好 | 中高 | 需引入中间件 |

**推荐 B**：与 Stripe/OpenAI 对齐，code 稳定不变，message 可后续做 i18n，前端按 code 分支处理。

### 3.2 分页策略

| 方案 | 数据一致性 | 实现复杂度 | 适用场景 |
|------|-----------|-----------|---------|
| A. offset（page/per_page） | 差（变动跳页） | 低 | 静态数据 |
| B. cursor（before/after + has_more） | 好 | 中 | 聊天消息、评审列表 |
| C. 无分页（现状 take:50） | N/A | 最低 | 仅原型 |

**推荐 B**：聊天消息按 createdAt+id 游标，评审列表按 submittedAt+id 游标，响应体带 `hasMore` + `nextCursor`。

### 3.3 WebSocket 房间隔离

| 方案 | 隔离性 | 授权强度 | 实现复杂度 |
|------|-------|---------|-----------|
| A. server.emit() 全局广播（现状） | 无 | 无 | 最低 |
| B. server.to(roomId).emit() + 客户端自觉 join | 强 | 弱（客户端可伪造 join） | 低 |
| C. server.to(roomId).emit() + 服务端校验后 join | 强 | 强 | 中 |

**推荐 C**：参考 Supabase，服务端在 `handleConnection` 后基于身份自动 join 有权限的 room，或提供 `join:room` 事件并服务端校验权限后 `client.join(roomId)`。

### 3.4 共享契约落地方式

| 方案 | 类型安全 | 运行时校验 | Swagger 驱动 | 现有契合度 |
|------|---------|-----------|-------------|-----------|
| A. class-validator DTO + @ApiProperty | 中 | 是 | 是 | 需重写所有 type |
| B. Zod 契约 + nestjs-zod 自动 DTO | 高 | 是 | 是 | 已有 contracts 包，高度契合 |
| C. OpenAPI codegen 前端客户端 | 高 | 否 | 是(spec 为源) | 需新增 codegen 流程 |

**推荐 B**：复用现有 `packages/contracts` Zod schema，用 `nestjs-zod` 同时驱动后端校验、前端类型、Swagger schema，一处定义三处生效。

### 3.5 连接状态暴露

| 方案 | 用户感知 | 实现复杂度 |
|------|---------|-----------|
| A. 静默 catch（现状） | 无 | 最低 |
| B. console.warn 仅日志 | 低 | 低 |
| C. UI 连接状态指示器 + 降级 banner | 高 | 中 |

**推荐 C**：参考 Discord/Slack，WebSocket 状态上升为 React state，渲染连接指示器；降级时显示 banner 并缩短轮询间隔。

## 4. 推荐方案

综合市面产品分析与方案对比，本轮修复采用以下总体策略：

1. **契约先行**：以 `packages/contracts` 的 Zod schema 为单一真相源，用 `nestjs-zod` 驱动后端 DTO 校验、前端类型导出、Swagger schema 生成（解决 A-001/A-002/A-016）。这避免维护 class-validator DTO、前端 type、OpenAPI 三套定义。

2. **Stripe 式错误码**：引入统一 `ApiException` + `GlobalExceptionFilter`，错误响应为 `{ code, type, message, param? }`，code 是稳定短字符串（如 `AUTH_TOKEN_EXPIRED`、`CHAT_ROOM_FORBIDDEN`），message 可后续 i18n（解决 A-008/A-009）。

3. **cursor 分页**：聊天消息与评审列表统一 cursor 分页（`before`/`limit` + `hasMore`/`nextCursor`），教师概览加 limit 防内存溢出（解决 A-004/R-013/R-024/R-006）。

4. **Socket.IO Rooms + 服务端授权 join**：`broadcastNewMessage` 改为 `server.to(roomId).emit()`；连接时服务端基于身份校验后让 client join 有权访问的 room（解决 R-004/A-005/R-010）。

5. **端点语义拆分 + 字段规范化**：GET /chat 拆为 `/chat/rooms`（教师列表）、`/chat/rooms/:roomId`（房间详情）；消息字段 `body` → `content`；NPC 响应补全 `llmUsed`（解决 A-010/A-012/A-013）。

6. **前端连接状态显式化**：WebSocket 状态上升为 React state，渲染指示器与降级 banner；修正 currentUserId/viewerRole 传递与降级默认值（解决 H-007/F-004/F-016/F-017/F-025/H-001）。

实施顺序遵循"契约 → 后端 → 前端"依赖链，P0 优先。

## 5. 原子化实施步骤

> 每个步骤可独立执行与验证。编号格式 `E{Epic}-S{Step}`。依赖关系标注前置步骤。

### Epic 1: 共享契约与 Swagger 基础（解决 A-001、A-002、A-016）

**E1-S1 补全 contracts 包的 chat/rooms/quests/npc/realtime 契约**
- 涉及文件: `packages/contracts/src/chat.ts`(新建)、`packages/contracts/src/rooms.ts`(新建)、`packages/contracts/src/quests.ts`(新建)、`packages/contracts/src/npc.ts`(新建)、`packages/contracts/src/realtime.ts`(新建)、`packages/contracts/src/index.ts`(追加导出)
- 改动内容: 用 Zod 定义：`createChatMessageSchema`({roomId, content, 含 maxLength:2000})、`chatMessageSchema`、`chatRoomPayloadSchema`(含 viewerRole)、`chatRoomOverviewSchema`、`roomAccessGrantSchema`、`accessibleRoomSchema`、`questSummarySchema`、`npcConversationRequestSchema`、`npcConversationResponseSchema`(含 llmUsed)、`realtimeEventSchema`(chat:message/presence:update/agent-status:update 的 payload)；在 index.ts 追加 `export * from "./chat"` 等
- 验证方法: `pnpm --filter contracts build` 通过；`pnpm --filter contracts test` 通过
- 依赖: 无

**E1-S2 安装 nestjs-zod 并配置 Swagger 自动 schema**
- 涉及文件: `apps/api/package.json`、`apps/api/src/main.ts`
- 改动内容: `pnpm --filter api add nestjs-zod`；在 main.ts 注册 `ZodModule`/`nestjs-zod` 的 Swagger 插件，使 Zod schema 自动生成 OpenAPI schema；DocumentBuilder 补全 `addTag` 分组与 `setExternalRef`
- 验证方法: 启动 API，访问 `/api-docs-json` 返回的 JSON 中 chat/npc 端点有 request/response schema
- 依赖: E1-S1

**E1-S3 将所有内联 type 替换为 contracts 的 Zod DTO**
- 涉及文件: `apps/api/src/modules/chat/chat.controller.ts`(CreateChatMessageBody)、`apps/api/src/modules/memory/npc-conversation.controller.ts`(NpcConversationResponse/PostConversationBody)、`apps/api/src/modules/reviews/reviews.controller.ts`(DecideReviewDto)、`apps/api/src/modules/rooms/rooms.controller.ts`(CreateAccessGrantDto)、`apps/api/src/modules/submissions/submissions.controller.ts`
- 改动内容: 用 `createZodDto(chatMessageCreateSchema)` 等替代内联 type 与手写 class DTO；删除各文件本地 type 定义，改为 `import { ... } from "contracts"`
- 验证方法: `pnpm --filter api build` 通过；`/api-docs` 中各端点"Try it out"可用且参数校验生效（超长消息被拒）
- 依赖: E1-S1、E1-S2

**E1-S4 前端 api-client 类型改用 contracts 导出**
- 涉及文件: `apps/web/src/lib/api-client.ts`
- 改动内容: 删除本地 `ChatMessage`/`ChatRoomPayload` 等 type，改为 `import type { ChatMessage, ChatRoomPayload } from "contracts"`；确保 web 依赖 contracts（workspace 已配置）
- 验证方法: `pnpm --filter web build` 通过；前端类型与后端一致
- 依赖: E1-S1

### Epic 2: 错误码体系（解决 A-008、A-009）

**E2-S1 建立错误码常量表与 ApiException 类**
- 涉及文件: `apps/api/src/errors/error-codes.ts`(新建)、`apps/api/src/errors/api-exception.ts`(新建)
- 改动内容: 定义错误码枚举常量（如 `AUTH_TOKEN_MISSING`/`AUTH_TOKEN_INVALID`/`AUTH_TOKEN_EXPIRED`/`AUTH_FORBIDDEN`/`CHAT_ROOM_FORBIDDEN`/`CHAT_ROOM_NOT_FOUND`/`REVIEW_NOT_READY`/`REVIEW_NOT_FOUND`/`VALIDATION_FAILED`/`RESOURCE_NOT_FOUND`/`CONFLICT`）；`ApiException` 类携带 `{ statusCode, code, type, message, param? }`；type 为枚举（`auth_error`/`validation_error`/`not_found`/`forbidden`/`conflict`/`server_error`）
- 验证方法: 单元测试构造 ApiException 并断言字段
- 依赖: 无

**E2-S2 实现 GlobalExceptionFilter 统一错误响应**
- 涉及文件: `apps/api/src/errors/global-exception.filter.ts`(新建)、`apps/api/src/main.ts`(替换 PrismaExceptionFilter 注册)
- 改动内容: filter 捕获 `ApiException`（直接序列化）、`HttpException`（映射为通用 code）、`Prisma.PrismaClientKnownRequestError`（P2025→`RESOURCE_NOT_FOUND`/404，P2002→`CONFLICT`/409）、未知错误（→`INTERNAL_ERROR`/500）；统一输出 `{ code, type, message, param? }`；保留 NestJS HttpException 的 statusCode 字段以兼容
- 验证方法: 请求不存在的评审 ID 返回 404 + `{code:"REVIEW_NOT_FOUND", type:"not_found"}`；请求缺 token 返回 401 + `{code:"AUTH_TOKEN_MISSING"}`
- 依赖: E2-S1

**E2-S3 改造 AuthGuard 区分 token 缺失/无效/过期**
- 涉及文件: `apps/api/src/modules/auth/auth.guard.ts`、`apps/api/src/modules/auth/auth.service.ts`
- 改动内容: token 缺失抛 `ApiException(401, AUTH_TOKEN_MISSING)`；token 解析失败抛 `AUTH_TOKEN_INVALID`；session.expiresAt 已过期抛 `AUTH_TOKEN_EXPIRED`；角色不符抛 `AUTH_FORBIDDEN`
- 验证方法: 三种 401 场景分别返回不同 code；前端可按 code 跳转登录或刷新
- 依赖: E2-S1、E2-S2

**E2-S4 统一业务错误消息为 code 驱动**
- 涉及文件: `apps/api/src/modules/reviews/reviews.controller.ts`、`apps/api/src/modules/chat/chat.service.ts`、`apps/api/src/modules/memory/npc-conversation.service.ts`
- 改动内容: 将 `"评审记录不存在"` 等中文硬编码与 `"Review is not ready"` 等英文硬编码替换为 `throw new ApiException(code, ...)`；message 统一为 code 对应的稳定描述（可后续接入 i18n 资源）
- 验证方法: 错误响应无中英文混杂，全部由 code 标识
- 依赖: E2-S1、E2-S2

### Epic 3: 分页体系（解决 A-004、R-013、R-024、R-006）

**E3-S1 在 contracts 定义通用分页契约**
- 涉及文件: `packages/contracts/src/pagination.ts`(新建)、`packages/contracts/src/index.ts`(追加导出)
- 改动内容: 定义 `paginatedQuerySchema`({ limit: 1..100 默认20, before?: string 游标 })、`paginatedResultSchema<T>`({ items, hasMore, nextCursor })；约定游标为 base64(createdAt+":"+id)
- 验证方法: `pnpm --filter contracts build` 通过
- 依赖: E1-S1

**E3-S2 聊天消息接口加 cursor 分页**
- 涉及文件: `apps/api/src/modules/chat/chat.service.ts`、`apps/api/src/modules/chat/chat.controller.ts`
- 改动内容: `getRoomPayload` 消息查询改为接收 `before`/`limit` 参数，`findMany` 用 `take: limit+1` 判断 hasMore，游标基于 `(createdAt desc, id desc)`；返回 `{ messages, hasMore, nextCursor }`
- 验证方法: 插入 >20 条消息后，首次返回 20 条 + hasMore=true；用 nextCursor 请求可获取更早消息
- 依赖: E3-S1

**E3-S3 评审列表接口加 cursor 分页并优化嵌套查询**
- 涉及文件: `apps/api/src/modules/reviews/reviews.controller.ts`
- 改动内容: `list` 接收 `before`/`limit`，findMany 加 `take: limit+1`，按 `submittedAt` 游标；summary 统计改为单独的轻量 count 查询（不再对全量数据内存过滤）；返回 `{ summary, items, hasMore, nextCursor }`
- 验证方法: 评审记录 >20 条时分页正常；summary 统计仍准确
- 依赖: E3-S1

**E3-S4 教师房间概览加 limit 防内存溢出**
- 涉及文件: `apps/api/src/modules/chat/chat.service.ts`(getTeacherRoomOverview)
- 改动内容: `lastMessages` findMany 加 `take: students.length`（每房间最多取1条最新），或改用 Prisma `groupBy`+`max`；为概览列表本身加 cursor 分页
- 验证方法: 大量学生时概览查询不返回超量数据；内存占用稳定
- 依赖: E3-S1

### Epic 4: 端点语义拆分与字段规范化（解决 A-010、A-011、A-012、A-013、A-018、R-010、R-014）

**E4-S1 拆分 GET /chat 为语义化端点**
- 涉及文件: `apps/api/src/modules/chat/chat.controller.ts`、`apps/api/src/modules/chat/chat.service.ts`、`apps/web/src/lib/api-client.ts`
- 改动内容: 新增 `GET /chat/rooms`（教师房间概览，返回 `{rooms}`）、`GET /chat/rooms/:roomId`（房间详情，返回统一 ChatRoomPayload）；保留 `GET /chat` 做学生自己的房间（无 roomId）；删除三合一的 getOverview 分支逻辑；前端 getChatRoom 改调 `/chat/rooms/:roomId`
- 验证方法: 三个端点响应结构各自独立且稳定；Swagger operationId 唯一
- 依赖: E1-S3

**E4-S2 文档化 Room ID 格式约定**
- 涉及文件: `packages/contracts/src/chat.ts`、`apps/api/src/modules/chat/chat.service.ts`
- 改动内容: 在 chat schema 的 roomId 字段 description 写明 `格式: room-chat-<studentId>`；`getRoomOwnerId`/`toRoomId` 提取为 contracts 导出的纯函数或常量 `ROOM_ID_PREFIX`；Swagger 端点描述补充格式说明
- 验证方法: `/api-docs` 中 roomId 字段 description 含格式约定；格式校验拒绝非法 roomId
- 依赖: E1-S1

**E4-S3 消息字段 body → content 重命名**
- 涉及文件: `packages/contracts/src/chat.ts`、`apps/api/src/modules/chat/chat.controller.ts`、`apps/api/src/modules/chat/chat.service.ts`、`apps/api/src/modules/realtime/realtime.gateway.ts`、`apps/web/src/lib/api-client.ts`、`apps/web/src/components/chat/room-messages.tsx`、`apps/web/src/components/chat/chat-room.tsx`
- 改动内容: ChatMessage/CreateChatMessagePayload 的 `body` 字段重命名为 `content`；后端 Prisma 查询映射 `body → content`（数据库列名可暂不改）；前端渲染改用 `message.content`；broadcast payload 字段同步改名
- 验证方法: 发送/接收消息正常；Swagger 字段名为 content；无 HTTP body 语义混淆
- 依赖: E1-S1、E1-S3
- 注意: 这是破坏性变更，需前后端同步部署

**E4-S4 NPC 响应补全 llmUsed 字段**
- 涉及文件: `apps/api/src/modules/memory/npc-conversation.controller.ts`、`packages/contracts/src/npc.ts`
- 改动内容: 控制器返回类型改为 contracts 的 `npcConversationResponseSchema`（含 llmUsed: boolean）；删除本地 NpcConversationResponse type；确保 GET/POST 两个端点都返回 llmUsed
- 验证方法: `/api-docs` NPC 响应 schema 含 llmUsed；实际响应含 llmUsed 字段
- 依赖: E1-S1、E1-S3

**E4-S5 限制教师只读，禁止在学生房间发消息**
- 涉及文件: `apps/api/src/modules/chat/chat.service.ts`(createMessage)、`apps/api/src/modules/chat/chat.controller.ts`
- 改动内容: `createMessage` 中教师角色调用时抛 `ApiException(403, CHAT_TEACHER_READ_ONLY)`；前端 ChatRoom 已有 `readOnly={viewerRole==="teacher"}` 隐藏输入框，保持一致
- 验证方法: 教师调用 POST /chat/messages 返回 403 + code CHAT_TEACHER_READ_ONLY
- 依赖: E2-S1

**E4-S6 消息长度上限校验**
- 涉及文件: `packages/contracts/src/chat.ts`(createChatMessageSchema)
- 改动内容: content 字段加 `.min(1).max(2000)`；Zod 校验在 ValidationPipe 生效；超长返回 400 + `VALIDATION_FAILED` + param=content
- 验证方法: 发送 2001 字符消息被拒；发送空消息被拒
- 依赖: E1-S1、E1-S3

**E4-S7 新增评审状态轮询端点**
- 涉及文件: `apps/api/src/modules/reviews/reviews.controller.ts`、`packages/contracts/src/reviews.ts`
- 改动内容: 新增 `GET /reviews/status?since=<timestamp>`，返回自该时间后状态变更的 submissionId 列表（轻量）；前端轮询此端点而非全量列表
- 验证方法: 评审状态变更后，status 端点返回变更项；全量列表仅在初次加载调用
- 依赖: E3-S3

### Epic 5: WebSocket 房间隔离与实时化（解决 R-004/A-005、A-006、H-007）

**E5-S1 broadcastNewMessage 改为按 roomId 隔离广播**
- 涉及文件: `apps/api/src/modules/realtime/realtime.gateway.ts`
- 改动内容: `broadcastNewMessage` 内 `this.server.emit("chat:message", message)` 改为 `this.server.to(message.roomId).emit("chat:message", message)`；`broadcastPresence`/`broadcastAgentStatus` 同理按需收敛到相关 room 或用户
- 验证方法: 在房间 A 发消息，房间 B 的客户端不应收到 `chat:message` 事件
- 依赖: 无

**E5-S2 handleConnection 后服务端授权 join room**
- 涉及文件: `apps/api/src/modules/realtime/realtime.gateway.ts`、`apps/api/src/modules/realtime/realtime.gateway.ts` 增加订阅处理
- 改动内容: 认证通过后，根据 user.role 自动 join：教师 join 所有学生 room（或提供 `join:room` 事件按需 join）；学生 join 自己的 room + 所有 approved 授权 room；新增 `@SubscribeMessage("join:room")` 处理器，服务端校验 RoomAccessGrant 后 `client.join(roomId)`；离开时 `client.leave(roomId)`
- 验证方法: 未授权用户 join 房间被拒；授权用户能收到该房间消息
- 依赖: E5-S1

**E5-S3 文档化 WebSocket 事件契约**
- 涉及文件: `packages/contracts/src/realtime.ts`、`docs/` 下新增 realtime 契约说明
- 改动内容: 用 Zod 定义每个事件的 payload schema（`chat:message`/`presence:update`/`agent-status:update`/`join:room`/`join:room:ack`）；文档说明认证方式（`handshake.auth.token`）、连接 URL（`:3001`）、重连策略；可选：用 `@nestjs/swagger` 无法覆盖 WS，单独维护 markdown 契约
- 验证方法: 契约文件存在且被前后端共享引用
- 依赖: E1-S1

**E5-S4 前端 RoomMessages 建立 WebSocket 连接监听 chat:message**
- 涉及文件: `apps/web/src/components/chat/room-messages.tsx`
- 改动内容: 新增 `io(getWsUrl(), { auth:{token}, transports:["websocket"], reconnection:true })`；连接后 emit `join:room`{roomId}；监听 `chat:message` 实时追加消息（按 id 去重）；保留 10s 轮询作为降级兜底；组件卸载时 disconnect
- 验证方法: 同房间另一客户端发消息，1s 内出现（无需等轮询）；组件卸载后无 socket 泄漏
- 依赖: E5-S1、E5-S2、E5-S3

**E5-S5 WebSocket 连接状态上升为 React state 并渲染指示器**
- 涉及文件: `apps/web/src/components/chat/room-messages.tsx`、`apps/web/src/components/world/world-shell.tsx`
- 改动内容: 新增 `wsStatus` state（connecting/connected/reconnecting/offline）；监听 socket 的 connect/disconnect/reconnect_failed 事件更新状态；UI 顶部渲染连接指示器（参考 Discord）；降级到 offline 时显示 banner 并将轮询间隔从 10s 缩短到 5s；连接恢复后停止轮询
- 验证方法: 断网时 UI 显示"离线模式（轮询中）"；恢复后显示"已连接"且实时推送正常
- 依赖: E5-S4

### Epic 6: 前端聊天与可访问性修复（解决 F-004、F-016、F-017、F-025、H-001）

**E6-S1 修正 currentUserId 传递，消除教师视角消息归属错误**
- 涉及文件: `apps/web/src/components/chat/chat-room.tsx`、`apps/web/src/app/chat/page.tsx`
- 改动内容: ChatRoom 新增 `currentUserId` prop（来自 `session.user.id`）；page.tsx 将 `session.user.id` 传入 ChatRoom；ChatRoom 将真实当前用户 ID 传给 RoomMessages（而非 studentId）；RoomMessages 用真实 currentUserId 判断 isSelf
- 验证方法: 教师视角下学生消息显示在左侧（他人），教师自己的消息（如有）显示右侧
- 依赖: 无

**E6-S2 消除 currentUserId/studentId 硬编码默认值**
- 涉及文件: `apps/web/src/components/chat/room-messages.tsx`、`apps/web/src/components/chat/chat-room.tsx`
- 改动内容: 删除 `currentUserId = "student-1"` 默认值，改为必填或抛错；删除 `studentId = "student-1"` 默认值；用 TypeScript 使其必填，编译期发现遗漏
- 验证方法: 不传 currentUserId 时 TS 编译报错；无硬编码 "student-1"
- 依赖: E6-S1

**E6-S3 修正降级模式下 viewerRole 默认值**
- 涉及文件: `apps/web/src/lib/api-client.ts`(EMPTY_CHAT_ROOM)
- 改动内容: `EMPTY_CHAT_ROOM` 的 viewerRole 不再硬编码 "owner"，改为接收调用方传入的实际 viewerRole（从 session.role 推导：teacher→teacher，否则→owner/guest 由调用方决定）；或降级时返回明确的 `degraded` 标志而非假 owner 权限
- 验证方法: 降级模式下 guest 用户不看到 owner UI（提交按钮/授权列表不出现）
- 依赖: 无

**E6-S4 清理 setTimeout 防止卸载后内存泄漏**
- 涉及文件: `apps/web/src/components/chat/room-messages.tsx`
- 改动内容: 将 `setTimeout(() => setMessageFeedback(null), 3000)` 的返回值存入 ref，在 useEffect cleanup 与组件卸载时 `clearTimeout`；同样检查 chat-room.tsx 的任何定时器
- 验证方法: React DevTools 无 "setState on unmounted component" 警告
- 依赖: 无

**E6-S5 聊天室页面 main 添加 data-scrollable 与滚动样式**
- 涉及文件: `apps/web/src/app/chat/page.tsx`
- 改动内容: `<main style={pageStyle}>` 添加 `data-scrollable` 属性与 `overflowY: "auto"`、`height: "100vh"`（或 maxHeight），确保内容超出视口时可滚动；同样检查所有 `<main>` 渲染分支（unauthenticated/api-unreachable/teacher 无 roomId）
- 验证方法: 消息列表很长时页面可上下滚动；无内容被裁剪
- 依赖: 无

## 6. 实施顺序与依赖图

```
E1-S1 (contracts 定义) ──┬─> E1-S2 (nestjs-zod) ──> E1-S3 (DTO 替换) ──> E1-S4 (前端类型)
                         ├─> E3-S1 (分页契约) ──> E3-S2/S3/S4 (分页实现)
                         ├─> E4-S2/S3/S4/S6 (字段/文档/NPC/校验)
                         └─> E5-S3 (WS 契约)
E2-S1 (错误码) ──> E2-S2 (Filter) ──┬─> E2-S3 (AuthGuard)
                                   └─> E2-S4 (业务错误)
E5-S1 (房间隔离) ──> E5-S2 (授权 join) ──> E5-S4 (前端 WS) ──> E5-S5 (状态指示器)
E4-S1 (端点拆分) 依赖 E1-S3
E4-S5 (教师只读) 依赖 E2-S1
E4-S7 (评审轮询) 依赖 E3-S3
E6-S1~S5 (前端修复) 多数可并行，E6-S1/S2 有依赖
```

**建议批次**:
- 批次 1（P0 快速止血）: E5-S1（房间隔离一行改动）、H-001/E6-S5（滚动）、E6-S1（消息归属）
- 批次 2（契约基础）: E1-S1~S4、E2-S1~S2
- 批次 3（后端完善）: E2-S3~S4、E3-S2~S4、E4-S1~S7、E5-S2~S3
- 批次 4（前端实时化）: E5-S4~S5、E6-S2~S4

## 7. 风险与注意事项

1. **破坏性变更**: E4-S3（body→content）需前后端同步部署，建议加版本灰度或临时双字段兼容期。
2. **nestjs-zod 成熟度**: 需确认其与 NestJS 11 + Swagger 的兼容性，若不兼容则回退方案 A（class-validator DTO + @ApiProperty 手动补全）。
3. **WebSocket join 授权**: 教师需 join 所有学生 room 可能在大规模下有性能开销，建议改为按需 join（教师打开某学生房间时才 join）。
4. **游标分页兼容**: 现有前端 `getChatRoom` 返回结构变化（新增 hasMore/nextCursor）需同步更新类型与轮询逻辑。
5. **Grep 工具异常**: 本次审查中 grep_code 工具对 `apps/api/src` 与 `apps/web/src` 路径返回 0 匹配（疑似工具 bug），所有结论均经 Read 逐文件确认，证据可靠。
