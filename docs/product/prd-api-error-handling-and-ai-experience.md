# PRD: API 错误处理与 AI Agent 体验优化

> **文档状态**: Draft v1.0  
> **负责人**: 产品官  
> **创建日期**: 2026-07-08  
> **关联审查**: 17 项问题（P0 致命 2 项 / Critical 2 项 / High 5 项 / P1 重要 3 项 / Medium 5 项）

---

## 目录

- [第一部分: P0 致命问题](#第一部分-p0-致命问题)
  - [1. SOP 端点同步阻塞超时（>60 秒）](#1-sop-端点同步阻塞超时60-秒)
  - [2. 无 API 文档（Swagger/OpenAPI）](#2-无-api-文档swaggeropenapi)
- [第二部分: Critical 问题](#第二部分-critical-问题)
  - [3. Teaching-agents 端点缺少授权校验](#3-teaching-agents-端点缺少授权校验)
  - [4. POST /reviews/decide 对不存在的 submissionId 返回 500](#4-post-reviewsdecide-对不存在的-submissionid-返回-500)
- [第三部分: High 问题](#第三部分-high-问题)
  - [5. POST /submissions 对无效 triggerType 返回 500](#5-post-submissions-对无效-triggertype-返回-500)
  - [6-9. Rooms 授权管理端点的 500 错误与校验缺失](#6-9-rooms-授权管理端点的-500-错误与校验缺失)
- [第四部分: P1 重要问题](#第四部分-p1-重要问题)
  - [10. 学生无法查询自己提交的评审状态](#10-学生无法查询自己提交的评审状态)
  - [11. 提交返回的 queue 字段为 null](#11-提交返回的-queue-字段为-null)
  - [12. 错误消息格式不一致](#12-错误消息格式不一致)
- [第五部分: Medium 问题](#第五部分-medium-问题)
  - [13. NPC 对话不校验 NPC ID](#13-npc-对话不校验-npc-id)
  - [14. SOP 评审结果包含幻觉数据](#14-sop-评审结果包含幻觉数据)
  - [15-17. 其他 Medium 问题](#15-17-其他-medium-问题)
- [附录: 市场方案对比总结](#附录-市场方案对比总结)

---

## 第一部分: P0 致命问题

### 1. SOP 端点同步阻塞超时（>60 秒）

#### 1.1 问题概述

**影响范围**: 教学 Agent SOP 端点（`/teaching-agents/review`、`/teaching-agents/question`、`/teaching-agents/quest-complete`、`/teaching-agents/collaborate`）完全不可用，AI Agent 无法调用。

**根因分析**:

当前 `TeachingAgentController` 中的 4 个端点全部采用同步阻塞模式，直接 `await` SOP 引擎的执行结果。SOP 引擎（`sop-engine.service.ts`）每个 SOP 流程包含 3 个步骤，每步调用一次 LLM（`ark-adapter.ts` 的 `chat()` 函数），3 次 LLM 调用串行执行。

```
请求到达 → findUnique(5ms) → Step1 LLM(15-25s) → Step2 LLM(15-25s) → Step3 LLM(15-25s) → finalize → 返回
                          总耗时: 45-75 秒
```

当 LLM 响应慢或网络抖动时，总耗时轻松超过 60 秒，导致 HTTP 超时或客户端断开连接。`collaborate` 端点同样串行调用 N 个 Agent + 1 次 summary 生成，最坏情况下 4 次串行 LLM 调用。

**证据**:
- `apps/api/src/modules/memory/teaching-agents/sop-engine.service.ts` 第 241-273 行: `for` 循环中 `await this.callLlm()` 串行执行
- `apps/api/src/modules/memory/teaching-agents/teaching-agent.controller.ts` 第 86 行: `const result = await this.sopEngine.runSop(...)` 同步阻塞
- `apps/api/src/modules/memory/teaching-agents/teaching-agent.service.ts` 第 47-81 行: `collaborate` 中 `for` 循环 `await this.callAgent()` 串行执行

#### 1.2 市场方案对比

| 产品/平台 | 方案 | 技术细节 |
|-----------|------|----------|
| **OpenAI Batch API** | 提交 → 轮询 → 获取结果 | `POST /v1/batches` 返回 `batch_id` + `status: "in_progress"`；客户端轮询 `GET /v1/batches/{id}` 检查 `status`；完成后下载结果文件。单次 Batch 支持最多 50,000 请求，24 小时内完成。 |
| **OpenAI Webhooks** | 提交 → 回调通知 | 对于 Deep Research、Fine-tuning 等长任务，支持注册 webhook URL，任务完成后自动 POST 通知，无需轮询。 |
| **Anthropic Claude** | 同步 + 流式 | 短任务直接同步返回；长任务通过 SSE (Server-Sent Events) 流式返回 token，客户端实时感知进度。 |
| **GitHub Actions API** | Job + 状态查询 | `POST /repos/{owner}/{repo}/actions/runs` 创建工作流运行，返回 `id`；轮询 `GET /actions/runs/{id}` 检查 `status` (`queued`/`in_progress`/`completed`) 和 `conclusion`。 |
| **Stripe** | Idempotency + Webhook | 支付创建返回 `PaymentIntent` 对象含 `status: "requires_action"`；轮询或 webhook 获取最终状态。`Idempotency-Key` 防止重复执行。 |

**最佳实践提炼**:

业界标准做法是 **Job Pattern（异步任务模式）**，核心三步：
1. **提交** (Submit): `POST /resource` 立即返回 `202 Accepted` + `{ jobId, status: "queued" }`
2. **轮询** (Poll): `GET /jobs/{jobId}` 返回 `{ status: "in_progress", progress: 66, estimatedRemainingMs: 8000 }`
3. **获取结果** (Result): 当 `status: "completed"` 时返回最终结果；`status: "failed"` 时返回错误信息

#### 1.3 推荐方案

**采用 Job Pattern 将 SOP 端点异步化。**

鉴于项目已有 BullMQ 队列基础设施（`review.queue.ts` / `review.processor.ts`），复用该模式扩展到 SOP 执行。

**步骤 1: 新建 SopJob 模型（Prisma schema）**

在 `apps/api/prisma/schema.prisma` 中新增：

```prisma
model SopJob {
  id          String   @id @default(cuid())
  sopType     String
  input       Json
  status      String   @default("queued")  // queued | in_progress | completed | failed
  result      Json?
  errorMessage String?
  userId      String
  createdAt   DateTime @default(now())
  completedAt DateTime?

  @@index([userId, createdAt])
}
```

执行 `npx prisma db push && npx prisma generate` 更新数据库和客户端。

**步骤 2: 新建 SopJobService（队列生产者 + 消费者）**

创建 `apps/api/src/modules/memory/teaching-agents/sop-job.service.ts`:

- **入队方法** `enqueue(sopType, input, userId)`: 创建 `SopJob` 记录，将 jobId 加入 BullMQ 队列，返回 `{ jobId, status: "queued" }`。
- **状态查询方法** `getStatus(jobId, userId)`: 校验 jobId 属于该 userId，返回 SopJob 记录。
- **队列消费者**: 监听队列消息，调用 `sopEngine.runSop()`，更新 SopJob 记录的 `status` 和 `result`。异常时设置 `status: "failed"` + `errorMessage`。

**步骤 3: 重构 TeachingAgentController**

将 4 个端点改为异步模式：

```
POST /teaching-agents/review        → 202 Accepted, { jobId, status: "queued" }
POST /teaching-agents/question      → 202 Accepted, { jobId, status: "queued" }
POST /teaching-agents/quest-complete → 202 Accepted, { jobId, status: "queued" }
POST /teaching-agents/collaborate   → 202 Accepted, { jobId, status: "queued" }

GET  /teaching-agents/jobs/:jobId   → 200 OK, { jobId, status, result?, errorMessage?, progress? }
```

Controller 中不再直接 `await sopEngine.runSop()`，改为调用 `sopJobService.enqueue()` 立即返回。

**步骤 4: 进度报告（可选增强）**

在 SOP 引擎的 `runSop` 中，每完成一个 step 后更新 SopJob 的 `progress` 字段（如 `1/3` → 33%，`2/3` → 66%），使客户端轮询时能获取进度百分比。

**步骤 5: 超时与清理**

设置 BullMQ 的 `jobTimeout` 为 180 秒（3 分钟），超时后自动标记为 `failed`。定期清理超过 7 天的已完成 SopJob 记录。

#### 1.4 验收标准

| 编号 | 验收条件 |
|------|----------|
| AC-1.1 | `POST /teaching-agents/review` 返回 HTTP 202，响应体包含 `jobId`（非空字符串）和 `status: "queued"`，响应时间 < 500ms |
| AC-1.2 | `GET /teaching-agents/jobs/{jobId}` 返回 SopJob 状态，`status` 为 `queued` / `in_progress` / `completed` / `failed` 之一 |
| AC-1.3 | 当 SOP 执行完成后，`GET /teaching-agents/jobs/{jobId}` 返回 `status: "completed"` 且 `result` 字段包含 `finalOutput` 和 `steps` |
| AC-1.4 | SOP 执行失败时，`GET /teaching-agents/jobs/{jobId}` 返回 `status: "failed"` 且 `errorMessage` 包含错误原因 |
| AC-1.5 | 用户 A 无法查询/获取用户 B 的 SopJob 结果（返回 403 Forbidden） |
| AC-1.6 | 4 个 SOP 端点（review / question / quest-complete / collaborate）全部改为异步模式，无同步阻塞 |
| AC-1.7 | BullMQ 不可用时（Redis down），SOP 仍能通过直接处理降级执行（复用 `submissions.controller.ts` 中的降级模式） |

---

### 2. 无 API 文档（Swagger/OpenAPI）

#### 2.1 问题概述

**影响范围**: AI Agent 无法自动发现和调用 API 端点，所有集成需人工阅读源码。

**根因分析**:

当前 API 后端（NestJS）未集成 Swagger/OpenAPI:
- `apps/api/src/main.ts`: 无 `SwaggerModule.setup()` 调用
- `apps/api/package.json`: 未安装 `@nestjs/swagger` 依赖
- `apps/api/src/app.module.ts`: 未导入 `SwaggerModule`
- 所有 Controller 未使用 `@ApiTags()`、`@ApiOperation()`、`@ApiResponse()` 等装饰器
- 无 `/api-docs` 或 `/swagger` 端点
- 无 `openapi.json` spec 文件暴露

AI Agent（如 LangChain OpenAPI Toolkit、AutoGPT）依赖 OpenAPI 规范文件来理解 API 结构、参数格式和响应模式。没有 OpenAPI spec，Agent 完全无法自主调用 API。

#### 2.2 市场方案对比

| 产品/平台 | 方案 | 技术细节 |
|-----------|------|----------|
| **LangChain OpenAPI Toolkit** | 运行时解析 OpenAPI spec | Agent 在运行时读取 OpenAPI JSON/YAML spec，自动生成可调用的 tool definitions。支持通过 LLM 决定调用哪个端点、传什么参数。 |
| **AutoGPT** | OpenAPI spec 驱动 | 读取 OpenAPI spec 文件，自动将每个端点注册为可用命令，Agent 通过自然语言推理选择调用。 |
| **Stripe API** | 完整 OpenAPI spec | 提供 machine-readable 的 `openapi/spec3.json`，包含所有端点、参数、响应的完整定义。每个错误码都有对应的文档 URL。 |
| **GitHub API** | OpenAPI + REST 文档 | 提供 OpenAPI 3.0 spec (`api.github.com/openapi.json`)，支持通过 `X-GitHub-Api-Version` header 选择 API 版本。 |
| **DigitalAPI AX 指南** | Agent Experience (AX) | OpenAPI 3.0+ 必须包含完整 schema 覆盖：每个端点、参数、请求体、响应格式、状态码都要定义。description 字段使用自然语言解释（非技术术语）。提供请求/响应示例。错误响应使用结构化 JSON（error_code + message + type + hint + documentation_url）。 |

**最佳实践提炼**:

1. **自动生成**: 使用 `@nestjs/swagger` 从代码装饰器自动生成 OpenAPI spec，避免手工维护
2. **机器可读**: 暴露 `/api-json` 端点返回 OpenAPI JSON，供 Agent 运行时消费
3. **人类友好**: 挂载 Swagger UI 在 `/api-docs`，供开发者浏览和测试
4. **AX 优先**: 每个 `@ApiOperation()` 的 description 使用自然语言描述端点用途、使用场景和约束条件

#### 2.3 推荐方案

**步骤 1: 安装依赖**

```bash
cd apps/api && pnpm add @nestjs/swagger
```

**步骤 2: 在 main.ts 中配置 Swagger**

修改 `apps/api/src/main.ts`，在 `app.listen()` 之前添加:

```typescript
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";

// 在 bootstrap() 中:
const config = new DocumentBuilder()
  .setTitle("Agent Guild RPG API")
  .setDescription("游戏化教学平台 API — 供 AI Agent 和开发者调用")
  .setVersion("1.0")
  .addBearerAuth()
  .build();
const document = SwaggerModule.createDocument(app, config);
SwaggerModule.setup("api-docs", app, document);
// 同时暴露 JSON spec 供 Agent 消费
// SwaggerModule.setup 默认在 /api-docs-json 暴露 JSON
```

**步骤 3: 为所有 Controller 添加 Swagger 装饰器**

为每个 Controller 类添加 `@ApiTags()`，为每个端点添加 `@ApiOperation()`、`@ApiResponse()`、`@ApiBody()`。重点：

- `@ApiOperation({ summary: "...", description: "自然语言描述端点用途、使用场景和约束" })`
- `@ApiResponse({ status: 200, description: "...", type: ResponseDto })`
- `@ApiResponse({ status: 400, description: "参数校验失败" })`
- `@ApiResponse({ status: 404, description: "资源不存在" })`
- `@ApiBearerAuth()` 标记需要认证的端点

**步骤 4: 为 DTO 添加 `@ApiProperty()` 装饰器**

将现有的 `type` 声明（如 `CreateAccessGrantBody`）转换为 class-validator DTO 类，并为每个字段添加 `@ApiProperty()`:

```typescript
@ApiProperty({ description: "被授权的用户 ID", example: "uuid-xxx" })
granteeId: string;
```

**步骤 5: 统一响应类型定义**

为每个端点创建响应 DTO 类，确保 OpenAPI spec 中有完整的响应 schema 定义。

#### 2.4 验收标准

| 编号 | 验收条件 |
|------|----------|
| AC-2.1 | 访问 `/api-docs` 显示 Swagger UI 页面，列出所有 API 端点 |
| AC-2.2 | 访问 `/api-docs-json` 返回符合 OpenAPI 3.0 规范的 JSON |
| AC-2.3 | 每个端点有 `operationId`、`summary` 和 `description` |
| AC-2.4 | 每个端点的请求参数和响应体有完整的 schema 定义 |
| AC-2.5 | 每个 DTO 字段有 `@ApiProperty()` 装饰器和示例值 |
| AC-2.6 | LangChain OpenAPI Toolkit 能加载 `/api-docs-json` 并自动生成可调用的 tool definitions |
| AC-2.7 | 所有需要认证的端点标记了 `@ApiBearerAuth()`，Swagger UI 支持 Bearer token 调试 |

---

## 第二部分: Critical 问题

### 3. Teaching-agents 端点缺少授权校验

#### 3.1 问题概述

**影响范围**: 学生 A 可以代替学生 B 触发 SOP 评审、答疑和关卡完成，存在数据安全风险。

**根因分析**:

当前 `TeachingAgentController` 的端点虽然使用了 `@UseGuards(AuthGuard)` 和 `@CurrentUser()` 装饰器，但存在以下授权漏洞:

1. **`POST /teaching-agents/question`**: 请求体包含 `studentId`，但控制器未校验 `body.studentId === user.id`。学生 A 可以传入学生 B 的 `studentId`，以 B 的身份触发答疑 SOP，且结果会写入 B 的记忆流。
2. **`POST /teaching-agents/quest-complete`**: 同样未校验 `body.studentId === user.id`。
3. **`POST /teaching-agents/review`**: 请求体包含 `submissionId`，控制器查询提交后直接使用 `submission.studentId` 写入记忆，未校验提交是否属于当前用户。教师可以评审任意提交（合理），但学生也应只能评审自己的提交。
4. **`POST /teaching-agents/collaborate`**: 完全未使用 `@CurrentUser()` 装饰器，无任何用户身份记录。

**证据**:
- `teaching-agent.controller.ts` 第 111-141 行 (`runQuestion`): 接受 `body.studentId` 但无校验
- `teaching-agent.controller.ts` 第 149-192 行 (`runQuestCompletion`): 接受 `body.studentId` 但无校验
- `teaching-agent.controller.ts` 第 52-103 行 (`runReview`): 查询 submission 后直接使用 `submission.studentId`
- `teaching-agent.controller.ts` 第 210-214 行 (`collaborate`): 无 `@CurrentUser()` 参数

#### 3.2 市场方案对比

| 产品/平台 | 方案 | 技术细节 |
|-----------|------|----------|
| **Stripe API** | 资源所有权校验 | 每个请求通过 API Key 自动确定 account scope，无法操作其他账户的资源。`GET /v1/customers/{id}` 会校验该 customer 是否属于当前 API Key 对应的账户。 |
| **GitHub API** | 权限粒度控制 | Token 携带 scope 信息（如 `repo`、`read:org`），每个端点检查 token 是否有对应 scope。`PATCH /repos/{owner}/{repo}` 校验 token 是否有 `repo` scope 且有该 repo 的写权限。 |
| **Canvas LMS** | 角色隔离 + 资源归属 | 学生只能查看自己的提交和成绩（`GET /api/v1/courses/:id/students/:student_id/submissions`）；教师可以查看所有学生的提交。基于 `enrollment` 角色和 `user_id` 过滤。 |

**最佳实践提炼**:

1. **隐式身份优先**: 尽量从 `@CurrentUser()` 获取用户身份，而非从请求体获取 `studentId`。客户端不应该指定"以谁的身份操作"。
2. **资源归属校验**: 操作某资源前，校验该资源是否属于当前用户（如 submission.studentId === user.id）。
3. **角色分层**: 教师角色可以操作任意学生的资源；学生角色只能操作自己的资源。

#### 3.3 推荐方案

**步骤 1: 使用 DTO 替代 type 声明，并从 @CurrentUser 获取身份**

将 `QuestionBody`、`QuestCompleteBody` 从请求体移除 `studentId`，改为从 `@CurrentUser()` 获取:

```typescript
class QuestionDto {
  @IsString() question!: string;
}
class QuestCompleteDto {
  @IsString() questId!: string;
}
```

Controller 中:
```typescript
@Post("question")
async runQuestion(
  @Body() body: QuestionDto,
  @CurrentUser() user: { id: string; role: UserRole; displayName: string },
) {
  const studentId = user.role === UserRole.student ? user.id : body.studentId;
  // 教师可以指定 studentId；学生只能用自己的身份
}
```

**步骤 2: review 端点添加资源归属校验**

```typescript
@Post("review")
async runReview(@Body() body: ReviewDto, @CurrentUser() user: ...) {
  const submission = await this.prisma.agentSubmission.findUnique({
    where: { id: body.submissionId },
  });
  if (!submission) throw new NotFoundException("提交不存在");
  // 学生只能评审自己的提交；教师可以评审任意提交
  if (user.role === UserRole.student && submission.studentId !== user.id) {
    throw new ForbiddenException("无权评审其他学生的提交");
  }
  // ... 继续执行
}
```

**步骤 3: collaborate 端点添加 @CurrentUser**

```typescript
@Post("collaborate")
async collaborate(
  @Body() body: CollaborateDto,
  @CurrentUser() user: { id: string; role: UserRole; displayName: string },
) {
  // 记录调用者身份，用于审计日志
  return this.agentService.collaborate(agents, body.topic, body.context);
}
```

#### 3.4 验收标准

| 编号 | 验收条件 |
|------|----------|
| AC-3.1 | 学生 A 调用 `POST /teaching-agents/question` 传入学生 B 的 `studentId`，返回 403 Forbidden |
| AC-3.2 | 学生 A 调用 `POST /teaching-agents/review` 传入学生 B 的 `submissionId`，返回 403 Forbidden |
| AC-3.3 | 教师可以评审任意学生的提交（返回 200/202） |
| AC-3.4 | `collaborate` 端点接受 `@CurrentUser()` 参数，未认证请求返回 401 |
| AC-3.5 | 所有端点的 `studentId` 优先从 `@CurrentUser()` 获取，请求体中的 `studentId` 仅教师可用 |

---

### 4. POST /reviews/decide 对不存在的 submissionId 返回 500

#### 4.1 问题概述

**影响范围**: AI Agent 调用 `POST /reviews/decide` 时传入不存在的 `submissionId`，收到 500 而非 404，无法区分"资源不存在"和"服务器错误"。

**根因分析**:

`reviews.controller.ts` 第 116 行使用 `findUniqueOrThrow()`:

```typescript
const existingReview = await this.prisma.reviewResult.findUniqueOrThrow({
  where: { submissionId: body.submissionId },
  ...
});
```

Prisma 的 `findUniqueOrThrow` 在记录不存在时抛出 `PrismaClientKnownRequestError`（code: `P2025`），NestJS 默认异常过滤器将其映射为 HTTP 500，而非 404。

**证据**:
- `apps/api/src/modules/reviews/reviews.controller.ts` 第 116 行: `findUniqueOrThrow`

#### 4.2 市场方案对比

| 产品/平台 | 方案 | 技术细节 |
|-----------|------|----------|
| **Stripe** | 404 for not found | `GET /v1/customers/{non_existent_id}` 返回 404 + `{ error: { type: "invalid_request_error", message: "No such customer: 'xxx'", param: "id" } }`。明确区分"资源不存在"(404) 和"服务器错误"(500)。 |
| **GitHub** | 404 for not found | `GET /repos/{owner}/{non_existent_repo}` 返回 404 + `{ message: "Not Found", documentation_url: "https://docs.github.com/rest/overview/resources-in-the-rest-api" }`。 |
| **通用 REST 最佳实践** | 语义化状态码 | 资源不存在 → 404；参数校验失败 → 400/422；权限不足 → 403；服务器内部错误 → 500。不要用 500 表示客户端错误。 |

#### 4.3 推荐方案

将 `findUniqueOrThrow` 替换为 `findUnique` + 手动 `throw new NotFoundException`:

```typescript
const existingReview = await this.prisma.reviewResult.findUnique({
  where: { submissionId: body.submissionId },
  select: { status: true, submission: { select: { studentId: true } } }
});

if (!existingReview) {
  throw new NotFoundException(`评审记录不存在: submissionId=${body.submissionId}`);
}
```

#### 4.4 验收标准

| 编号 | 验收条件 |
|------|----------|
| AC-4.1 | `POST /reviews/decide` 传入不存在的 `submissionId`，返回 HTTP 404 |
| AC-4.2 | 404 响应体包含清晰的 `message` 字段说明资源不存在 |
| AC-4.3 | 服务器内部错误仍然返回 500（区分客户端错误和服务器错误） |

---

## 第三部分: High 问题

### 5. POST /submissions 对无效 triggerType 返回 500

#### 5.1 问题概述

**影响范围**: AI Agent 提交任务时传入无效的 `triggerType`（如 `"unknown"`），收到 500 而非 400。

**根因分析**:

`submissions.controller.ts` 第 200-204 行的 `toTriggerType` 方法:

```typescript
private toTriggerType(triggerType: string) {
  return SubmissionTriggerType[
    triggerType as keyof typeof SubmissionTriggerType
  ];
}
```

当 `triggerType` 为无效值（如 `"unknown"`），TypeScript 枚举索引返回 `undefined`。Prisma 尝试将 `undefined` 写入 `SubmissionTriggerType` 枚举字段时抛出 `PrismaClientValidationError`，NestJS 映射为 500。

**证据**:
- `apps/api/src/modules/submissions/submissions.controller.ts` 第 200-204 行
- `apps/api/prisma/schema.prisma` 第 46-50 行: `enum SubmissionTriggerType { button; chat_command; schedule }`

#### 5.2 市场方案对比

| 产品/平台 | 方案 | 技术细节 |
|-----------|------|----------|
| **Stripe** | 400 + param 字段 | 无效参数返回 400 + `{ error: { type: "invalid_request_error", param: "triggerType", message: "Invalid triggerType: 'unknown'. Must be one of: button, chat_command, schedule." } }`。 |
| **GitHub** | 422 Unprocessable Entity | 无效字段值返回 422 + `{ message: "Invalid request.", errors: [{ field: "triggerType", code: "invalid" }] }`。 |

#### 5.3 推荐方案

**步骤 1: 在 DTO 中使用 `@IsIn()` 装饰器进行枚举校验**

```typescript
import { IsIn } from "class-validator";

class CreateSubmissionDto {
  @IsIn(["button", "chat_command", "schedule"])
  triggerType!: string;
}
```

这样 `ValidationPipe` 会在请求进入 Controller 之前拦截无效值，返回 400 + `{ message: ["triggerType must be one of: button, chat_command, schedule"] }`。

**步骤 2: 移除 `toTriggerType` 方法**

DTO 校验通过后，直接使用 `body.triggerType as SubmissionTriggerType` 转换。或保留 `toTriggerType` 但添加防御性检查:

```typescript
private toTriggerType(triggerType: string): SubmissionTriggerType {
  const value = SubmissionTriggerType[
    triggerType as keyof typeof SubmissionTriggerType
  ];
  if (!value) {
    throw new BadRequestException(
      `Invalid triggerType: '${triggerType}'. Must be one of: button, chat_command, schedule.`
    );
  }
  return value;
}
```

#### 5.4 验收标准

| 编号 | 验收条件 |
|------|----------|
| AC-5.1 | `POST /submissions` 传入 `triggerType: "unknown"`，返回 HTTP 400 |
| AC-5.2 | 400 响应体 `message` 字段说明合法的 triggerType 值 |
| AC-5.3 | 传入合法的 `triggerType`（如 `"button"`），正常返回 200 |

---

### 6-9. Rooms 授权管理端点的 500 错误与校验缺失

#### 6.1 问题概述

**影响范围**: Rooms 授权管理端点存在 4 个独立的 High 问题:

| # | 问题 | 根因 |
|---|------|------|
| 6 | `POST /rooms/access-grants/:id/revoke` 对不存在的 grantId 返回 500 | `rooms.service.ts` 第 49 行 `findUniqueOrThrow` 抛 Prisma P2025 错误 |
| 7 | `POST /rooms/access-grants` 允许为不存在的用户创建授权 | `createGrant` 未校验 `granteeId` 是否存在于 User 表 |
| 8 | `POST /rooms/access-grants` 缺少字段时返回 500 | Controller 使用 `type CreateAccessGrantBody` 而非 class-validator DTO，ValidationPipe 不生效 |
| 9 | `POST /rooms/access-grants/:id/revoke` 允许重复撤销 | `revokeGrant` 未检查当前 status 是否已是 `"revoked"` |

**证据**:
- `apps/api/src/modules/rooms/rooms.service.ts` 第 49 行: `findUniqueOrThrow`
- `apps/api/src/modules/rooms/rooms.service.ts` 第 18-26 行: `createGrant` 无 granteeId 校验
- `apps/api/src/modules/rooms/rooms.controller.ts` 第 7-12 行: `type CreateAccessGrantBody`（非 class）
- `apps/api/src/modules/rooms/rooms.service.ts` 第 54-57 行: `revokeGrant` 无 status 检查

#### 6.2 市场方案对比

| 产品/平台 | 方案 | 技术细节 |
|-----------|------|----------|
| **Stripe** | 400 for invalid params + 404 for not found | 缺少必填参数 → 400 + `param` 字段标识错误参数；资源不存在 → 404；重复操作 → 409 Conflict（如重复使用 Idempotency-Key）。 |
| **GitHub** | 422 for validation + 409 for conflict | 字段校验失败 → 422；重复创建 → 409 或 422；资源不存在 → 404。 |
| **通用 REST** | 语义化状态码体系 | 400 = 请求格式错误；404 = 资源不存在；409 = 状态冲突（如重复操作）；422 = 语义校验失败。 |

#### 6.3 推荐方案

**步骤 1: 创建 `CreateAccessGrantDto`（解决问题 #8）**

将 `type CreateAccessGrantBody` 转换为 class-validator DTO:

```typescript
class CreateAccessGrantDto {
  @IsString() roomId!: string;
  @IsString() granteeId!: string;
  @IsOptional() @IsString() scope?: string;
  @IsOptional() @IsNumber() @Min(1) @Max(168) expiresInHours?: number;
}
```

这样 `ValidationPipe`（已配置 `whitelist: true, forbidNonWhitelisted: true`）会自动校验必填字段，缺失时返回 400。

**步骤 2: granteeId 存在性校验（解决问题 #7）**

在 `rooms.service.ts` 的 `createGrant` 中添加:

```typescript
const grantee = await this.prisma.user.findUnique({
  where: { id: granteeId },
  select: { id: true }
});
if (!grantee) {
  throw new NotFoundException(`被授权用户不存在: ${granteeId}`);
}
```

**步骤 3: revokeGrant 改用 findUnique + 手动 404（解决问题 #6）**

```typescript
const existingGrant = await this.prisma.roomAccessGrant.findUnique({
  where: { id: grantId }
});
if (!existingGrant) {
  throw new NotFoundException(`授权记录不存在: ${grantId}`);
}
```

**步骤 4: 重复撤销校验（解决问题 #9）**

在 `revokeGrant` 中添加状态检查:

```typescript
if (existingGrant.status === "revoked") {
  throw new ConflictException("该授权已被撤销，无法重复操作");
}
```

#### 6.4 验收标准

| 编号 | 验收条件 |
|------|----------|
| AC-6.1 | `POST /rooms/access-grants/:id/revoke` 传入不存在的 grantId，返回 404 |
| AC-6.2 | `POST /rooms/access-grants` 传入不存在的 granteeId，返回 404 |
| AC-6.3 | `POST /rooms/access-grants` 缺少 `roomId` 或 `granteeId`，返回 400 |
| AC-6.4 | `POST /rooms/access-grants/:id/revoke` 对已撤销的授权再次调用，返回 409 Conflict |
| AC-6.5 | 所有错误响应包含 `message` 字段说明错误原因 |

---

## 第四部分: P1 重要问题

### 10. 学生无法查询自己提交的评审状态

#### 10.1 问题概述

**影响范围**: AI Agent 无法为学生查询提交后的评审进度。

**根因分析**:

`GET /reviews` 端点（`reviews.controller.ts` 第 52-107 行）仅教师可用（`assertTeacher(user.role)` 抛出 `ForbiddenException`）。学生提交后无法查询评审状态，只能等待 WebSocket 推送（`broadcastAgentStatus`）或前端轮询。

无学生专属的评审状态查询端点。AI Agent 无法为学生回答"我的提交评审到哪一步了"的问题。

**证据**:
- `apps/api/src/modules/reviews/reviews.controller.ts` 第 52-56 行: `assertTeacher(user.role)` 在 `list()` 方法开头

#### 10.2 市场方案对比

| 产品/平台 | 方案 | 技术细节 |
|-----------|------|----------|
| **Canvas LMS** | 学生专属端点 | `GET /api/v1/courses/:course_id/students/:student_id/submissions` — 学生查看自己的提交，包含 `workflow_state`（`submitted`/`pending_review`/`graded`）、`score`、`grade`、`grader_id` 等字段。教师通过不同端点查看所有学生的提交。 |
| **Moodle** | 分离的查看权限 | 学生通过 `mod_assign_get_submission_status` 查看自己提交的状态（`status`、`gradingstatus`、`timemodified`）；教师通过 `mod_assign_get_submissions` 查看所有提交。 |
| **GitHub Actions** | 公开可见的运行状态 | 任何人有 repo 读权限都能查看 workflow run 的 `status` 和 `conclusion`。 |

**最佳实践提炼**:

学生端评审查询应返回精简信息（不含其他学生的数据），包含: 提交摘要、评审状态（queued/ai_reviewed/teacher_decided）、建议分数、最终分数、评审结论。

#### 10.3 推荐方案

**新增 `GET /reviews/my-submissions` 端点**

在 `reviews.controller.ts` 中新增学生专属端点:

```typescript
@Get("my-submissions")
async listMySubmissions(
  @CurrentUser() user: { id: string; role: UserRole; displayName: string }
) {
  if (user.role !== UserRole.student) {
    throw new ForbiddenException("Student access required");
  }

  const submissions = await this.prisma.agentSubmission.findMany({
    where: { studentId: user.id },
    include: { reviewResult: true, day: true },
    orderBy: { submittedAt: "desc" }
  });

  return submissions.map((sub) => ({
    submissionId: sub.id,
    dayLabel: `Day ${sub.dayId.replace("day-", "")}`,
    workSummary: sub.workSummary,
    submittedAt: sub.submittedAt.toISOString(),
    reviewStatus: sub.reviewResult?.status ?? "queued",
    suggestedScore: sub.reviewResult?.suggestedScore,
    finalScore: sub.reviewResult?.finalScore,
    decision: sub.reviewResult?.decision,
    rationale: sub.reviewResult?.rationale
  }));
}
```

该端点:
- 仅返回当前学生自己的提交（`where: { studentId: user.id }`）
- 包含评审状态和结果（不含其他学生信息）
- 按提交时间倒序排列

#### 10.4 验收标准

| 编号 | 验收条件 |
|------|----------|
| AC-10.1 | 学生调用 `GET /reviews/my-submissions` 返回自己的提交列表及评审状态 |
| AC-10.2 | 响应中 `reviewStatus` 为 `queued` / `ai_reviewed` / `teacher_decided` 之一 |
| AC-10.3 | 学生 A 调用时不会返回学生 B 的提交数据 |
| AC-10.4 | 教师调用返回 403 Forbidden |
| AC-10.5 | 响应包含 `suggestedScore`、`finalScore`、`decision` 字段（可能为 null） |

---

### 11. 提交返回的 queue 字段为 null

#### 11.1 问题概述

**影响范围**: AI Agent 无法追踪提交后的评审任务进度。

**根因分析**:

`submissions.controller.ts` 第 156-197 行:

```typescript
let queue: { jobId: string; status: string } | null = null;
let queueAvailable = false;
try {
  queue = await Promise.race([
    this.reviewQueue.enqueue(created.submission.id),
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Redis timeout")), 2000))
  ]);
  queueAvailable = true;
} catch {
  // Redis unavailable — fall back to direct processing below
}
// ...
return { submission: ..., review: ..., queue };  // queue 可能是 null
```

当 Redis 不可用或 2 秒超时，`queue` 为 `null`。AI Agent 无法通过 `queue.jobId` 追踪评审进度。即使 Redis 可用，`queue` 字段的结构也缺少 `status` 的枚举值定义和进度信息。

#### 11.2 市场方案对比

| 产品/平台 | 方案 | 技术细节 |
|-----------|------|----------|
| **OpenAI Batch** | 始终返回 job_id | `POST /v1/batches` 成功后始终返回 `id`（batch_id）和 `status`。即使进入队列也需要 `id` 用于后续查询。 |
| **GitHub Actions** | 始终返回 run id | `POST /repos/{owner}/{repo}/actions/runs` 成功后返回 `id`（run id），可用于后续轮询。 |
| **Stripe** | PaymentIntent 始终有 ID | 创建支付意图后始终返回 `pi_xxx` ID + `status`，客户端据此决定下一步操作。 |

**最佳实践提炼**:

即使异步处理降级到同步执行，也应返回一个可追踪的标识符。降级模式可以返回 `{ jobId: submission.id, status: "processing_directly", fallback: true }`。

#### 11.3 推荐方案

**步骤 1: 降级时也返回可追踪的标识符**

```typescript
if (!queueAvailable) {
  // 直接处理时，用 submission.id 作为追踪 ID
  queue = {
    jobId: created.submission.id,
    status: "processing"
  };
  queueMicrotask(() => {
    void this.reviewProcessingService.processSubmissionReview(created.submission.id);
  });
}

return {
  submission: this.toSubmissionResponse(created.submission),
  review: this.toReviewResponse(created.review),
  queue: {
    jobId: queue.jobId,
    status: queue.status,
    trackUrl: `/reviews/my-submissions`  // AI Agent 可轮询此端点查看进度
  }
};
```

**步骤 2: 统一 queue 响应结构**

确保 `queue` 字段始终是对象而非 null:

```typescript
queue: {
  jobId: string;        // 始终非空
  status: "queued" | "processing" | "completed" | "failed";
  trackUrl?: string;    // 可选的进度查询端点
}
```

#### 11.4 验收标准

| 编号 | 验收条件 |
|------|----------|
| AC-11.1 | `POST /submissions` 响应中 `queue` 字段始终为非 null 对象 |
| AC-11.2 | `queue.jobId` 始终为非空字符串，可用于后续追踪 |
| AC-11.3 | `queue.status` 为 `queued` / `processing` 之一 |
| AC-11.4 | Redis 不可用时（降级模式），`queue` 仍包含有效 `jobId` 和 `status: "processing"` |
| AC-11.5 | `queue.trackUrl` 指向学生可查询评审状态的端点 |

---

### 12. 错误消息格式不一致

#### 12.1 问题概述

**影响范围**: AI Agent 无法可靠解析错误响应，无法自动恢复。

**根因分析**:

当前错误响应依赖 NestJS 默认异常过滤器，格式不一致:

1. **class-validator 错误**（ValidationPipe）: `message` 是数组，如 `["triggerType must be a string", "studentId must be a string"]`
2. **NestJS HTTP 异常**（如 `NotFoundException`）: `message` 是字符串，如 `"评审记录不存在"`
3. **Prisma 错误**（未被捕获）: `message` 是原始 Prisma 错误字符串，`statusCode` 为 500

NestJS 默认错误响应格式:
```json
{
  "statusCode": 400,
  "message": ["field1 must be a string", "field2 must be a string"],
  "error": "Bad Request"
}
```

vs

```json
{
  "statusCode": 404,
  "message": "评审记录不存在",
  "error": "Not Found"
}
```

`message` 字段有时是数组、有时是字符串，AI Agent 无法可靠解析。

#### 12.2 市场方案对比

| 产品/平台 | 错误格式 | 示例 |
|-----------|----------|------|
| **Stripe** | 统一结构化错误 | `{ "error": { "type": "invalid_request_error", "code": "parameter_missing", "message": "Missing required param: granteeId.", "param": "granteeId", "doc_url": "https://docs.stripe.com/errors#parameter-missing" } }` |
| **GitHub** | 统一结构 + documentation_url | `{ "message": "Not Found", "documentation_url": "https://docs.github.com/rest/overview/resources-in-the-rest-api", "status": "404" }` |
| **OpenAI** | 统一结构化错误 | `{ "error": { "message": "Invalid triggerType", "type": "invalid_request_error", "param": "triggerType", "code": "invalid_value" } }` |
| **DigitalAPI AX 指南** | error_code + message + type + hint | `{ "error_code": "INVALID_TRIGGER_TYPE", "message": "triggerType must be one of: button, chat_command, schedule.", "type": "validation_error", "field": "triggerType", "hint": "Check the OpenAPI spec for valid values." }` |

**最佳实践提炼**:

统一错误响应格式，关键要素:
1. `error.code` — 机器可读的错误码（如 `RESOURCE_NOT_FOUND`、`VALIDATION_ERROR`）
2. `error.message` — 人类可读的错误描述（始终是字符串，即使有多个校验错误也用分号连接）
3. `error.type` — 错误类型分类（`validation_error`、`not_found`、`forbidden`、`server_error`）
4. `error.field`（可选）— 出错的字段名
5. `error.documentation_url`（可选）— 错误说明文档 URL

#### 12.3 推荐方案

**步骤 1: 创建全局异常过滤器 `AllExceptionsFilter`**

创建 `apps/api/src/filters/all-exceptions.filter.ts`:

```typescript
import { ExceptionFilter, Catch, ArgumentsHost, HttpException, HttpStatus, Logger } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { Response } from "express";

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger("ExceptionFilter");

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let errorResponse: { code: string; message: string; type: string; field?: string };

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const r = exception.getResponse();
      // 统一 message 为字符串
      const message = typeof r === "object" && r !== null && "message" in r
        ? Array.isArray(r.message) ? r.message.join("; ") : String(r.message)
        : exception.message;
      errorResponse = {
        code: this.httpStatusToCode(status),
        message,
        type: this.httpStatusToType(status),
      };
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      // 处理 Prisma 错误
      if (exception.code === "P2025") {
        status = HttpStatus.NOT_FOUND;
        errorResponse = { code: "RESOURCE_NOT_FOUND", message: "请求的资源不存在", type: "not_found" };
      } else if (exception.code === "P2002") {
        status = HttpStatus.CONFLICT;
        errorResponse = { code: "DUPLICATE_RESOURCE", message: "资源已存在", type: "conflict" };
      } else {
        errorResponse = { code: "DATABASE_ERROR", message: "数据库操作失败", type: "server_error" };
      }
    } else {
      errorResponse = { code: "INTERNAL_ERROR", message: "服务器内部错误", type: "server_error" };
      this.logger.error(`Unhandled exception: ${exception}`);
    }

    response.status(status).json({ error: errorResponse });
  }

  private httpStatusToCode(status: number): string {
    const map: Record<number, string> = {
      400: "VALIDATION_ERROR",
      401: "UNAUTHORIZED",
      403: "FORBIDDEN",
      404: "RESOURCE_NOT_FOUND",
      409: "CONFLICT",
      422: "UNPROCESSABLE_ENTITY",
      500: "INTERNAL_ERROR",
    };
    return map[status] ?? "UNKNOWN_ERROR";
  }

  private httpStatusToType(status: number): string {
    if (status >= 400 && status < 500) return "client_error";
    if (status >= 500) return "server_error";
    return "unknown";
  }
}
```

**步骤 2: 在 main.ts 中注册全局过滤器**

```typescript
app.useGlobalFilters(new AllExceptionsFilter());
```

**步骤 3: 统一所有错误响应格式**

所有错误响应统一为:
```json
{
  "error": {
    "code": "RESOURCE_NOT_FOUND",
    "message": "评审记录不存在: submissionId=xxx",
    "type": "client_error"
  }
}
```

校验错误时:
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "triggerType must be one of: button, chat_command, schedule; granteeId must be a string",
    "type": "client_error",
    "field": "triggerType"
  }
}
```

#### 12.4 验收标准

| 编号 | 验收条件 |
|------|----------|
| AC-12.1 | 所有错误响应遵循统一格式: `{ error: { code, message, type } }` |
| AC-12.2 | `error.message` 始终为字符串（非数组），多个校验错误用分号连接 |
| AC-12.3 | `error.code` 为机器可读的大写蛇形字符串（如 `VALIDATION_ERROR`、`RESOURCE_NOT_FOUND`） |
| AC-12.4 | Prisma P2025 错误自动映射为 404 + `RESOURCE_NOT_FOUND` |
| AC-12.5 | Prisma P2002 错误自动映射为 409 + `DUPLICATE_RESOURCE` |
| AC-12.6 | 未捕获异常返回 500 + `INTERNAL_ERROR`，且服务器端记录错误日志 |

---

## 第五部分: Medium 问题

### 13. NPC 对话不校验 NPC ID

#### 13.1 问题概述

当前 `getPersona(npcId)` 对不存在的 NPC ID 返回 `DEFAULT_PERSONA`（"神秘NPC"），而非返回 404。AI Agent 无法区分"有效的 NPC 对话"和"请求了不存在的 NPC"。

#### 13.2 市场方案对比

| 产品/平台 | 方案 |
|-----------|------|
| **Stripe** | 无效资源 ID 返回 404 + 明确错误消息 |
| **GitHub** | 无效用户/组织返回 404 |
| **通用 REST** | 不存在的资源应返回 404，而非静默返回默认数据 |

#### 13.3 推荐方案

在 `npc-conversation.controller.ts` 中添加 NPC ID 校验:

```typescript
@Get(":npcId/conversation")
async getConversation(@Param("npcId") npcId: string, ...) {
  if (!NPC_PERSONAS[npcId]) {
    throw new NotFoundException(`NPC 不存在: ${npcId}`);
  }
  return this.conversationService.getConversation(npcId, studentId, message);
}
```

或者在 `npc-personas.ts` 的 `getPersona` 中抛出异常，但推荐在 Controller 层校验以保持 Service 层的纯函数特性。

#### 13.4 验收标准

| 编号 | 验收条件 |
|------|----------|
| AC-13.1 | 传入不存在的 NPC ID，返回 404 + `RESOURCE_NOT_FOUND` |
| AC-13.2 | 传入有效的 NPC ID（如 `receptionist`），正常返回对话 |

---

### 14. SOP 评审结果包含幻觉数据

#### 14.1 问题概述

LLM 生成的评审结果可能包含虚构的数据（如"91 个工件"），与实际提交内容不符。

#### 14.2 推荐方案

**步骤 1: 在 prompt 中明确约束 LLM 只使用提供的数据**

修改 `sop-engine.service.ts` 的 `buildPrompt`，添加约束指令:

```
请仅基于以下提供的数据进行评审，不要编造任何数据。
工件数量: ${input.artifacts?.length ?? 0}
工作摘要: ${input.workSummary ?? "未提供"}
```

**步骤 2: 后处理校验（防御性检查）**

在 `finalize` 阶段对 LLM 输出进行简单校验，如检查工件数量是否与输入一致:

```typescript
finalize: (steps, input) => {
  const finalOutput = definition.finalize(steps, input);
  // 校验 LLM 是否幻觉了工件数量
  const actualCount = input.artifacts?.length ?? 0;
  // 简单的数值提取校验
  return finalOutput;
}
```

**步骤 3: 在响应中附加原始数据摘要**

在 SopResult 中新增 `inputSummary` 字段，包含工件数量等关键数据，便于客户端交叉验证:

```typescript
export type SopResult = {
  // ... 现有字段
  inputSummary?: { artifactCount: number; workSummaryLength: number };
};
```

#### 14.3 验收标准

| 编号 | 验收条件 |
|------|----------|
| AC-14.1 | SOP prompt 中包含"仅使用提供的数据"约束指令 |
| AC-14.2 | SopResult 包含 `inputSummary` 字段，含 `artifactCount` 等原始数据摘要 |
| AC-14.3 | LLM 输出中的工件数量与输入一致（抽查验证） |

---

### 15-17. 其他 Medium 问题

#### 15. 无效 zone 参数静默返回全部数据

**问题**: `agent-avatar.controller.ts` 第 34-37 行，传入无效 zone（如 `"invalid"`）时，`filterZone` 为 `undefined`，静默返回所有 avatar 而非报错。

**方案**: 当 `zone` 参数存在但不在 `validZones` 中时，返回 400:

```typescript
if (zone && !validZones.has(zone)) {
  throw new BadRequestException(
    `Invalid zone: '${zone}'. Valid zones: lobby, workstations, collab-room, review-station.`
  );
}
```

#### 16. pendingCount 统计忽略 queued 状态

**问题**: `reviews.controller.ts` 第 90-92 行，`pendingCount` 只统计 `ReviewStatus.ai_reviewed`，忽略了 `queued` 状态。刚提交但尚未 AI 评审的提交不被计入待处理数量。

**方案**: 修改过滤条件，同时包含 `queued` 和 `ai_reviewed`:

```typescript
pendingCount: sortedReviews.filter(
  (review) =>
    review.status === ReviewStatus.ai_reviewed ||
    review.status === ReviewStatus.queued
).length,
```

#### 17. collaborate 端点不使用 @CurrentUser

**问题**: `teaching-agent.controller.ts` 第 210-214 行，`collaborate` 方法无 `@CurrentUser()` 参数，无用户身份记录。

**方案**: 添加 `@CurrentUser()` 装饰器（见问题 #3 步骤 3），用于审计日志和身份记录。

#### 验收标准

| 编号 | 验收条件 |
|------|----------|
| AC-15.1 | 传入无效 zone 值，返回 400 + 合法 zone 列表 |
| AC-16.1 | `pendingCount` 同时包含 `queued` 和 `ai_reviewed` 状态的记录 |
| AC-17.1 | `collaborate` 端点包含 `@CurrentUser()` 参数，未认证请求返回 401 |

---

## 附录: 市场方案对比总结

### 异步任务处理模式

| 维度 | OpenAI Batch | GitHub Actions | Stripe | 本项目推荐 |
|------|-------------|---------------|--------|-----------|
| 提交响应 | 202 + batch_id | 201 + run_id | 200 + PaymentIntent id | 202 + jobId |
| 状态查询 | GET /batches/{id} | GET /actions/runs/{id} | GET /payment_intents/{id} | GET /teaching-agents/jobs/{id} |
| 完成通知 | Webhook | Webhook (可选) | Webhook | 轮询为主，Webhook 为可选增强 |
| 超时处理 | 24h 窗口 | 可配置 timeout | 依赖银行超时 | BullMQ jobTimeout 180s |

### 错误处理标准

| 维度 | Stripe | GitHub | OpenAI | 本项目推荐 |
|------|--------|--------|--------|-----------|
| 响应格式 | `{ error: { type, code, message, param } }` | `{ message, documentation_url }` | `{ error: { message, type, param, code } }` | `{ error: { code, message, type, field? } }` |
| 资源不存在 | 404 | 404 | 404 | 404 + `RESOURCE_NOT_FOUND` |
| 参数校验失败 | 400 + `param` | 422 | 400 + `param` | 400 + `VALIDATION_ERROR` |
| 状态冲突 | 409 | 409 | 409 | 409 + `CONFLICT` |
| 服务器错误 | 500 (罕见) | 500 | 500 | 500 + `INTERNAL_ERROR` |

### API 发现机制

| 维度 | LangChain | AutoGPT | DigitalAPI AX | 本项目推荐 |
|------|-----------|---------|---------------|-----------|
| Spec 格式 | OpenAPI 3.0+ | OpenAPI 3.0+ | OpenAPI 3.0+ | OpenAPI 3.0+（@nestjs/swagger 自动生成）|
| 消费方式 | 运行时加载 spec | 加载 spec 文件 | /openapi.json 端点 | /api-docs-json 端点 |
| 描述风格 | 自然语言 description | 自然语言 description | 明确的使用指引 | @ApiOperation description 含使用场景 |
| 示例 | 请求/响应示例 | 请求/响应示例 | 请求/响应示例 | @ApiProperty example |

### 学生评审查询

| 维度 | Canvas LMS | Moodle | 本项目推荐 |
|------|-----------|--------|-----------|
| 学生端点 | GET /courses/:id/students/:id/submissions | mod_assign_get_submission_status | GET /reviews/my-submissions |
| 返回字段 | workflow_state, score, grade, grader_id | status, gradingstatus, timemodified | reviewStatus, suggestedScore, finalScore, decision |
| 权限隔离 | 仅自己的提交 | 仅自己的提交 | 仅自己的提交（studentId === user.id） |

---

## 实施优先级与依赖关系

```
Phase 1 (P0 — 立即修复，解除阻塞):
  ├─ #2 Swagger/OpenAPI 集成（无依赖，可独立开始）
  └─ #1 SOP 异步化（依赖 BullMQ，已有基础设施）
       └─ #12 统一错误过滤器（应与 #1 同步实施，为后续所有错误处理奠基）

Phase 2 (Critical — 安全修复):
  ├─ #3 授权校验（依赖 #12 统一错误格式）
  └─ #4 findUniqueOrThrow → 404（依赖 #12 统一错误格式）

Phase 3 (High — 错误码修正):
  ├─ #5 triggerType 枚举校验
  ├─ #6-9 Rooms 端点修复（#8 DTO 创建依赖 #2 Swagger DTO 装饰器）
  │    ├─ #6 revokeGrant → 404
  │    ├─ #7 granteeId 存在性校验
  │    ├─ #8 CreateAccessGrantDto
  │    └─ #9 重复撤销 → 409
  └─ #12 统一错误格式（前置依赖，Phase 1 完成）

Phase 4 (P1 — 功能增强):
  ├─ #10 学生评审查询端点
  └─ #11 queue 字段非 null

Phase 5 (Medium — 质量提升):
  ├─ #13 NPC ID 校验
  ├─ #14 SOP 幻觉防护
  ├─ #15 zone 参数校验
  ├─ #16 pendingCount 修复
  └─ #17 collaborate @CurrentUser
```

---

## 技术栈与依赖变更

| 变更类型 | 包名 | 用途 |
|----------|------|------|
| 新增依赖 | `@nestjs/swagger` | 自动生成 OpenAPI spec 和 Swagger UI |
| 新增文件 | `apps/api/src/filters/all-exceptions.filter.ts` | 全局异常过滤器 |
| 新增文件 | `apps/api/src/modules/memory/teaching-agents/sop-job.service.ts` | SOP 异步任务服务 |
| 新增 Prisma 模型 | `SopJob` | SOP 任务记录表 |
| 修改文件 | `apps/api/src/main.ts` | 注册 Swagger + 全局过滤器 |
| 修改文件 | `apps/api/src/app.module.ts` | 提供 AllExceptionsFilter |
| 修改文件 | 所有 Controller | 添加 Swagger 装饰器 + 错误处理修正 |
| 修改文件 | `apps/api/src/modules/rooms/rooms.controller.ts` | type → class-validator DTO |
| 修改文件 | `apps/api/src/modules/rooms/rooms.service.ts` | findUniqueOrThrow → findUnique + 404 |
| 修改文件 | `apps/api/src/modules/reviews/reviews.controller.ts` | findUniqueOrThrow → findUnique + 404 + 新增 my-submissions 端点 |
| 修改文件 | `apps/api/src/modules/submissions/submissions.controller.ts` | triggerType 枚举校验 + queue 非 null |
| 修改文件 | `apps/api/src/modules/memory/teaching-agents/teaching-agent.controller.ts` | 异步化 + 授权校验 + @CurrentUser |
| 修改文件 | `apps/api/src/modules/memory/npc-conversation.controller.ts` | NPC ID 校验 |
| 修改文件 | `apps/api/src/modules/memory/agent-avatar/agent-avatar.controller.ts` | zone 参数校验 |
