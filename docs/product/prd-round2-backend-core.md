# PRD: 后端核心系统第二轮修复 — 评审流程、安全认证与性能一致性

> **文档版本**: v1.0
> **日期**: 2026-07-08
> **作者**: 产品官 Tina
> **状态**: 待评审
> **审查轮次**: Phase 1 审查发现的后端核心问题

---

## 目录

1. [问题概述](#1-问题概述)
2. [市面产品分析](#2-市面产品分析)
3. [方案对比](#3-方案对比)
4. [推荐方案](#4-推荐方案)
5. [原子化实施步骤 — 评审流程系统（P0）](#5-原子化实施步骤--评审流程系统p0)
6. [原子化实施步骤 — 安全与认证](#6-原子化实施步骤--安全与认证)
7. [原子化实施步骤 — 性能与数据一致性](#7-原子化实施步骤--性能与数据一致性)
8. [实施优先级与依赖关系](#8-实施优先级与依赖关系)
9. [验收标准汇总](#9-验收标准汇总)

---

## 1. 问题概述

Phase 1 审查在后端核心系统中发现了 38 个问题，按严重程度分为三组。

### 1.1 P0 致命 — 评审流程系统（11 个问题）

评审流程是教学平台的核心闭环：学生提交任务 -> AI 初评 -> 教师裁定 -> 反馈学生。当前该闭环在多个环节断裂。

| 编号 | 问题 | 影响 | 涉及文件 |
|------|------|------|--------|
| R-001 | BullMQ Worker createReviewWorker() 从未被调用 | Redis 可用时评审任务入队但永不消费，评审流程完全瘫痪 | apps/api/src/modules/queue/review.processor.ts:141-149, apps/api/src/app.module.ts |
| R-002 | defaultReviewProcessor 硬编码返回 85 分+approve，不写数据库 | 即使 Worker 启动，评审结果也不会持久化 | apps/api/src/modules/queue/review.processor.ts:24-36 |
| R-003 | SOP 评审结果只写入 AgentMemory，不更新 ReviewResult 表状态 | 教师评审队列永远看不到 SOP 评审结果 | apps/api/src/modules/memory/teaching-agents/teaching-agent.controller.ts:97-108 |
| R-018 | POST /reviews/decide 存在 TOCTOU 竞态条件 | 并发裁定可能覆盖彼此结果 | apps/api/src/modules/reviews/reviews.controller.ts:130-161 |
| R-019 | 同一学生可对同一 dayId 无限重复提交 | 数据膨胀，评审队列被淹没 | apps/api/src/modules/submissions/submissions.controller.ts:137-163 |
| R-020 | artifacts 嵌套 DTO 未用 @ValidateNested | 恶意 payload 可注入未校验字段 | apps/api/src/modules/submissions/submissions.controller.ts:67-68 |
| F-003 | 前端评审通过操作对无分数提交给出 0 分 | 教师点通过时 AI 建议分被丢弃 | apps/web/src/components/teacher/review-queue.tsx:55,308-321 |
| F-015 | deriveSummary 使用中文字符串匹配计算统计 | 统计逻辑脆弱，国际化即失效 | apps/web/src/components/teacher/review-queue.tsx:297-306 |
| A-017 | POST /reviews/decide 读-写竞态（同 R-018） | — | — |
| A-020 | 默认评审处理器硬编码 85 分，finalScore 在 AI 评审阶段就被设置 | AI 初评分数被当作最终分数，教师裁定前数据已污染 | apps/api/src/modules/queue/review.processor.ts:122 |

### 1.2 高危 — 安全与认证（17 个问题）

| 编号 | 问题 | 影响 | 涉及文件 |
|------|------|------|--------|
| R-004 | WebSocket 全局广播无房间隔离 | 聊天消息跨房间泄露 | apps/api/src/modules/realtime/realtime.gateway.ts:42 |
| R-007 | 登录无速率限制 | 可暴力破解密码 | apps/api/src/modules/auth/auth.controller.ts:26-29 |
| R-008 | POST /teaching-agents/review 无授权检查 | 任意用户可触发 LLM 调用消耗配额 | apps/api/src/modules/memory/teaching-agents/teaching-agent.controller.ts:60-111 |
| R-009 | POST /teaching-agents/collaborate 无角色检查 | 可滥用 LLM 配额 | apps/api/src/modules/memory/teaching-agents/teaching-agent.controller.ts:242-250 |
| R-012 | CORS 允许所有来源 | CSRF 和跨域攻击风险 | apps/api/src/main.ts:10 |
| R-015 | 8 个请求体使用 TypeScript type 而非 class-validator DTO | 请求体不被校验 | teaching-agent.controller.ts, npc-conversation.controller.ts, memory.controller.ts, chat.controller.ts |
| R-021 | NPC 对话不验证 studentId 归属 | 可冒充其他学生进行对话 | apps/api/src/modules/memory/npc-conversation.controller.ts:71-82,96-107 |
| R-022 | 会话 token 明文存储在 localStorage | XSS 可直接窃取 token | apps/web/src/lib/session.ts:29-35 |
| R-028 | Swagger UI 无认证保护 | API 结构泄露给未授权用户 | apps/api/src/main.ts:20-28 |
| R-029 | WebSocket 连接后会话过期不检查 | 过期 token 连接持续有效 | apps/api/src/modules/realtime/realtime.gateway.ts:10-24 |
| F-007 | Cookie 缺少 secure 标志 | HTTPS 下 cookie 可被中间人截获 | apps/web/src/lib/session.ts:35 |
| F-008 | localStorage session 无过期校验 | 过期 session 被当作有效使用 | apps/web/src/lib/session.ts:10-27 |
| F-011 | 工会页面无认证检查 | 未登录可访问受限页面 | apps/web/src/app/guilds/page.tsx |
| A-003 | 多个端点无输入验证（同 R-015） | — | — |
| A-005 | WebSocket 消息广播到所有客户端（同 R-004） | — | — |
| A-007 | POST /submissions 无幂等性保护（同 R-019） | — | — |
| A-014 | Token 8 小时硬过期，无刷新机制 | 用户使用中途被登出 | apps/api/src/modules/auth/auth.service.ts:23 |
| A-019 | GET /auth/session 手动解析 Header | 逻辑分散，无统一中间件 | apps/api/src/modules/auth/auth.controller.ts:33-36 |

### 1.3 中危 — 性能与数据一致性（10 个问题）

| 编号 | 问题 | 影响 | 涉及文件 |
|------|------|------|--------|
| R-016 | Promise.race 超时产生孤立 unhandled rejection | 进程级告警噪音，潜在内存泄漏 | apps/api/src/modules/submissions/submissions.controller.ts:168-171 |
| R-017 | queueMicrotask + void 模式导致 10 处 unhandled rejection | 异步错误被静默吞没 | 6 个文件，10+ 处 |
| R-023 | LLM 调用无超时配置 | LLM 卡住时请求永久挂起 | apps/api/src/modules/memory/llm/ark-adapter.ts:23-26 |
| R-024 | 评审列表无分页 | 数据量增长后性能劣化 | apps/api/src/modules/reviews/reviews.controller.ts:66-87 |
| R-025 | getSession 过度加载 User 全字段（含 passwordHash） | 敏感字段泄露到内存 | apps/api/src/modules/auth/auth.service.ts:42-47 |
| R-026 | 过期会话无定时清理 | 数据库持续膨胀 | 全局缺失（无 cron/scheduler） |
| R-030 | lastReflectTime Map 无限增长 | 内存泄漏 | apps/api/src/modules/memory/memory.service.ts:30 |
| R-031 | 反思洞察逐条 create 而非 createMany | N 次数据库往返 | apps/api/src/modules/memory/memory.service.ts:164-173 |
| R-032 | retrieve limit 参数无边界校验 | limit=999999 可拉取全部数据 | apps/api/src/modules/memory/memory.controller.ts:89 |
| R-036 | world controller include owner:true 过度加载 | passwordHash 等敏感字段暴露 | apps/api/src/modules/world/world.controller.ts:26-29 |

---

## 2. 市面产品分析

### 2.1 评审流程系统

#### GitHub Classroom
- 提交模型：学生 push 代码到 assignment repo，GitHub Actions 自动触发评分脚本
- 任务消费：Actions runner 是独立进程，由 GitHub 平台管理，确保任务一定被消费
- 幂等性：每次 push 生成新的 commit SHA，评审结果与 commit 绑定
- 状态流转：queued -> in_progress -> completed

**关键洞察**：BullMQ Worker 必须在应用启动时被实例化，而非仅作为导出函数。

#### Canvas LMS
- 状态分离：AI 建议分(suggested_score)和教师最终分(final_score)是两个独立字段
- 并发安全：评审状态变更使用数据库乐观锁（version 字段）
- 重复提交：同一作业同一学生只保留最新提交，旧提交标记为 obsolete

**关键洞察**：suggested_score 和 final_score 分离模式正是本项目需要的。AI 评审阶段不应设置 finalScore。

#### Khan Academy
- 重试限制：同一练习可多次尝试，但记录每次尝试分数，取最高分
- 状态简化：只有 correct / incorrect / attempted 三态

**关键洞察**：限制重复提交的理念值得借鉴。

### 2.2 安全与认证

#### Coursera
- 登录限流：基于 IP + 邮箱双重维度，5 次失败后锁定 15 分钟
- 会话管理：使用 HttpOnly + Secure + SameSite cookie 存储 session ID
- Token 刷新：access_token 15 分钟，refresh_token 7 天，滑动续期

#### Supabase
- WebSocket 认证：连接时携带 JWT，服务端验证后加入用户专属 channel
- 房间隔离：使用 PostgreSQL RLS 策略，每个 WebSocket 事件自动校验权限
- 会话刷新：token 过期前 60 秒自动续期

#### Discord
- 频道隔离：客户端 SUBSCRIBE 特定频道，服务端按频道分发事件
- 心跳机制：每 41.25 秒发送 HEARTBEAT，超时 2 次未收到则断开连接
- 会话恢复：断线重连时携带 session_id 和 seq

### 2.3 性能与数据一致性

#### Stripe API
- 幂等性：每个 POST 请求可携带 Idempotency-Key header，相同 key 返回相同结果
- 超时控制：所有外部 HTTP 调用设置 30 秒超时
- 分页：cursor-based pagination，has_more + next_page_token 模式

#### Slack
- Promise 管理：使用 Promise.allSettled 替代 Promise.race，避免孤立 rejection
- 异步安全：所有异步操作包装在 try-catch 中，失败写入 dead letter queue

#### Moodle
- 会话清理：cron 任务每 1 小时清理过期 session
- 批量操作：所有批量写入使用 insert_records()，避免逐条写入
- 分页：所有列表 API 强制分页，默认 20 条，最大 100 条

---

## 3. 方案对比

### 3.1 评审流程方案对比

| 维度 | 方案 A: Worker+默认处理器 | 方案 B: 移除队列走同步 | 方案 C: Worker+Service处理器(推荐) |
|------|------|------|------|
| 任务消费 | 启动Worker但硬编码85分 | 无队列，提交时直接调用 | Worker处理器绑定到ReviewProcessingService |
| 持久化 | 不写数据库 | 同步写数据库，阻塞响应 | 异步写数据库，非阻塞 |
| 可扩展性 | 差 | 差 | 好(Worker可独立部署) |
| 改动量 | 小 | 中 | 中 |

### 3.2 finalScore分离方案对比

| 维度 | 保持finalScore=suggestedScore | AI阶段finalScore设为null(推荐) | 移除finalScore字段 |
|------|------|------|------|
| 语义清晰度 | 差(finalScore非final) | 好(null表示待定) | 差(破坏现有契约) |
| 前端影响 | 无 | 需处理null展示 | 需重构API契约 |
| 改动量 | 无 | 小 | 大 |

### 3.3 重复提交防护方案对比

| 维度 | 唯一约束+冲突报错 | 幂等Key(Stripe模式)(推荐) | 软限制 |
|------|------|------|------|
| 可靠性 | 数据库级保证 | 应用+数据库双层保证 | 仅应用层 |
| 用户体验 | 第二次提交报409 | 相同Key返回原结果 | 可提交但产生警告 |
| 改动量 | 小 | 中 | 小 |

### 3.4 WebSocket房间隔离方案对比

| 维度 | server.to(roomId).emit(推荐) | 按用户ID投递 | Redis pub/sub |
|------|------|------|------|
| 粒度 | 房间级 | 用户级 | 频道级 |
| 复杂度 | 低 | 中 | 高 |
| 可扩展性 | 单实例 | 单实例 | 多实例 |

### 3.5 登录限流方案对比

| 维度 | 全局限流 | 登录专用限流(推荐) | Redis滑动窗口 |
|------|------|------|------|
| 精度 | IP级 | IP+邮箱级 | IP+邮箱级 |
| 存储 | 内存 | 内存 | Redis |
| 多实例 | 不支持 | 不支持 | 支持 |

### 3.6 异步错误处理方案对比

| 维度 | try-catch每个void | safeAsync工具函数(推荐) | 全局unhandledRejection |
|------|------|------|------|
| 精度 | 方法级 | 方法级 | 进程级 |
| 可维护性 | 差(大量重复) | 好(统一工具) | 差(仅兜底) |
| 错误可见性 | 好 | 好 | 差(仅日志) |

---

## 4. 推荐方案

| 问题领域 | 推荐方案 | 对标产品 |
|---------|---------|--------|
| R-001 Worker未启动 | Worker启动时绑定ReviewProcessingService | GitHub Classroom |
| R-002/A-020 硬编码+finalScore | AI阶段finalScore设为null | Canvas LMS |
| R-003 SOP不更新ReviewResult | SOP完成后更新ReviewResult表 | Canvas LMS |
| R-018 TOCTOU竞态 | Prisma事务+条件updateMany | Canvas LMS |
| R-019 重复提交 | 幂等Key模式 | Stripe API |
| R-020 嵌套校验 | 添加@ValidateNested+@Type | NestJS官方 |
| F-003/F-015 前端修复 | suggestedScore+decision枚举 | Canvas LMS |
| R-004 WebSocket广播 | server.to(roomId).emit | Discord |
| R-007 登录限流 | @nestjs/throttler登录专用 | Coursera |
| R-008/R-009 授权检查 | 资源归属校验+角色检查 | Supabase |
| R-012 CORS | 配置白名单来源 | NestJS官方 |
| R-015 type转class | class-validator DTO | NestJS官方 |
| R-021 NPC studentId | 从@CurrentUser获取 | Coursera |
| R-022/F-007/F-008 Token安全 | HttpOnly cookie+过期校验 | Supabase |
| R-028 Swagger | 添加BasicAuth guard | NestJS官方 |
| R-029 WS过期检查 | 心跳+定期session校验 | Discord |
| A-014 刷新机制 | 滑动续期+refresh token | Coursera |
| A-019 手动解析 | 使用Guard+@CurrentUser | NestJS官方 |
| R-016 Promise.race | AbortController+Promise.allSettled | Slack |
| R-017 void模式 | 封装safeAsync工具函数 | Slack |
| R-023 LLM超时 | OpenAI client设置timeout | Stripe |
| R-024 无分页 | cursor-based分页 | Stripe |
| R-025/R-036 过度加载 | select指定字段 | Supabase |
| R-026 会话清理 | @Cron定时任务 | Moodle |
| R-030 Map增长 | LRU缓存或定期清理 | — |
| R-031 逐条create | createMany | Moodle |
| R-032 limit边界 | clamp(1,100) | Moodle |

---

## 5. 原子化实施步骤 — 评审流程系统（P0）

### 步骤 5.1: 修复 BullMQ Worker 启动（R-001）

**问题**: createReviewWorker() 已定义但从未被调用，Redis 可用时评审任务入队后永不消费。

**涉及文件**: apps/api/src/modules/queue/review.processor.ts, apps/api/src/app.module.ts

**具体改动**:
1. 在 ReviewProcessingService 中实现 OnApplicationBootstrap 接口
2. 在 onApplicationBootstrap() 中调用 createReviewWorker()，传入包装了 this.processSubmissionReview 的 processor 函数
3. 在 onApplicationShutdown() 中关闭 Worker 连接
4. Worker processor 内部调用 this.processSubmissionReview(job.data.submissionId) 并返回结果
5. 添加 try-catch 包裹 processor 逻辑，失败时记录日志

**验证方法**: 启动 Redis 和 API 服务，学生提交后 job 被 consume，ReviewResult 状态从 queued 变为 ai_reviewed

**依赖关系**: 无前置依赖

---

### 步骤 5.2: 移除硬编码处理器，修正 finalScore 语义（R-002, A-020）

**问题**: defaultReviewProcessor 硬编码 85 分+approve 不写数据库；finalScore 在 AI 评审阶段就被设置为 suggestedScore。

**涉及文件**: apps/api/src/modules/queue/review.processor.ts

**具体改动**:
1. 删除 defaultReviewProcessor 函数（第 24-36 行）
2. 修改 createReviewWorker 签名，移除默认参数
3. 修改 processSubmissionReview 第 122 行：将 finalScore: suggestedScore 改为 finalScore: null
4. 确保 updateMany 的 data 中 finalScore 设为 null

**验证方法**: AI 评审完成后 suggestedScore 有值但 finalScore 为 null；GET /reviews 返回的 finalScore 为 null

**依赖关系**: 依赖步骤 5.1 完成

---

### 步骤 5.3: SOP 评审结果同步更新 ReviewResult 表（R-003）

**问题**: POST /teaching-agents/review 的 SOP 结果只写入 AgentMemory，不更新 ReviewResult 表。

**涉及文件**: apps/api/src/modules/memory/teaching-agents/teaching-agent.controller.ts

**具体改动**:
1. 在 runReview 方法中 SOP 执行完成后（第 94 行之后），增加更新 ReviewResult 表的逻辑
2. 使用 prisma.reviewResult.updateMany 条件更新：where status=queued，data 中设置 status=ai_reviewed, suggestedScore, decision, rationale, aiReviewedAt
3. 如果 SOP 结果不包含分数信息，至少更新 status 为 ai_reviewed 并写入 rationale
4. 保留现有 AgentMemory 写入逻辑不变

**验证方法**: 调用 POST /teaching-agents/review 后 ReviewResult 表 status 变为 ai_reviewed；教师评审队列中能看到 SOP 评审过的提交

**依赖关系**: 依赖步骤 5.2 完成

---

### 步骤 5.4: 修复 TOCTOU 竞态条件（R-018, A-017）

**问题**: POST /reviews/decide 先 findUnique 读取状态再 update 写入，无事务保护。

**涉及文件**: apps/api/src/modules/reviews/reviews.controller.ts

**具体改动**:
1. 将 decide 方法中的读-写操作包装在 this.prisma.$transaction 中
2. 在事务内先 findUnique 读取评审状态
3. 使用条件 updateMany 替代 update：where 同时包含 submissionId 和 status=ai_reviewed
4. 检查 updateMany 返回的 count：为 0 则抛出 ConflictException
5. 将 queueMicrotask 调用移到事务外

**验证方法**: 并发调用 POST /reviews/decide 只有一个成功返回 200，另一个返回 409

**依赖关系**: 无前置依赖

---
### 步骤 5.5: 添加提交幂等性保护（R-019, A-007）

**问题**: 同一学生可对同一 dayId 无限重复提交。

**涉及文件**: apps/api/src/modules/submissions/submissions.controller.ts, apps/api/prisma/schema.prisma

**具体改动**:
1. 在 create 方法事务内创建提交前，查询该学生该 dayId 是否已有提交
2. 如果已有提交且状态为 queued 或 ai_reviewed，返回 409 ConflictException
3. 如果已有提交且状态为 teacher_decided，允许重新提交
4. 添加 Idempotency-Key header 支持：相同 key 返回原结果
5. 可选：在 schema.prisma 中添加 @@unique([studentId, dayId])

**验证方法**: 同一学生同一 dayId 第二次提交返回 409；携带相同 Idempotency-Key 的重复请求返回第一次结果

**依赖关系**: 无前置依赖

---

### 步骤 5.6: 添加 artifacts 嵌套校验（R-020）

**问题**: SubmissionArtifactDto 已定义为 class，但 artifacts 字段未使用 @ValidateNested。

**涉及文件**: apps/api/src/modules/submissions/submissions.controller.ts

**具体改动**:
1. 在 CreateSubmissionDto 的 artifacts 字段上添加 @ValidateNested({ each: true })
2. 在 SubmissionArtifactDto 上添加 @Type(() => SubmissionArtifactDto) 装饰器
3. 确保已导入 ValidateNested 和 Type

**验证方法**: 发送 artifacts 中包含额外字段的请求返回 400；发送合法 artifacts 返回 201

**依赖关系**: 无前置依赖

---

### 步骤 5.7: 修复前端评审通过操作使用 suggestedScore（F-003）

**问题**: getNextFinalScore 在 currentFinalScore 为 null 时默认为 0，导致通过操作给出 0 分。

**涉及文件**: apps/web/src/components/teacher/review-queue.tsx

**具体改动**:
1. 在 ReviewQueueItem 类型中添加 suggestedScore: number | null 字段
2. 在 handleDecision 中改为传入 item.currentFinalScore ?? item.suggestedScore ?? 0
3. 修改 getNextFinalScore：approve 决策使用传入的分数（即 suggestedScore）
4. 确保后端 GET /reviews 返回的数据包含 suggestedScore 字段（已有）

**验证方法**: AI 评审完成但教师未裁定时点通过按钮，finalScore 应为 suggestedScore 而非 0

**依赖关系**: 无前置依赖

---

### 步骤 5.8: 修复 deriveSummary 使用枚举值而非字符串匹配（F-015）

**问题**: deriveSummary 使用中文字符串匹配判断 flagged 状态。

**涉及文件**: apps/web/src/components/teacher/review-queue.tsx

**具体改动**:
1. 在 LocalReviewQueueItem 类型中添加 currentDecision: string | null 字段
2. 修改 toLocalReviewQueueItems 从后端返回数据中提取 decision 值
3. 修改 deriveSummary 中 flaggedCount：改为 item.currentDecision === adjust || item.currentDecision === reject
4. 修改 handleDecision 中更新 queueState 的逻辑，同步更新 currentDecision

**验证方法**: 修改 decision label 显示文本后统计仍然正确；adjust 和 reject 的提交被正确计入 flaggedCount

**依赖关系**: 可与步骤 5.7 合并执行

---

## 6. 原子化实施步骤 — 安全与认证

### 步骤 6.1: WebSocket 房间隔离（R-004, A-005）

**问题**: `broadcastNewMessage` 使用 `this.server.emit` 广播到所有客户端，聊天消息跨房间泄露。

**涉及文件**:
- 修改: `apps/api/src/modules/realtime/realtime.gateway.ts`

**具体改动**:

1. 修改 `broadcastNewMessage` 方法：将 `this.server.emit("chat:message", message)` 改为 `this.server.to(message.roomId).emit("chat:message", message)`
2. 在 `handleConnection` 中，认证通过后让客户端加入其有权访问的房间频道：查询用户的可访问房间列表，对每个 roomId 调用 `client.join(roomId)`
3. 添加 `handleJoinRoom` 方法：客户端发送 `join:room` 事件时，服务端校验用户对该 roomId 的访问权限，通过后调用 `client.join(roomId)`
4. 添加 `handleLeaveRoom` 方法：客户端断开或切换房间时，调用 `client.leave(roomId)`
5. 修改 `broadcastPresence` 和 `broadcastAgentStatus`：考虑是否也需要按房间/区域隔离

**验证方法**:
- 在房间 A 发送消息，房间 B 的客户端不应收到
- 加入房间 A 的客户端能收到房间 A 的消息
- 未加入房间的客户端不收到消息

**依赖关系**: 无前置依赖

---

### 步骤 6.2: 登录速率限制（R-007）

**问题**: 登录端点无速率限制，可暴力破解密码。

**涉及文件**:
- 修改: `apps/api/package.json`（添加 `@nestjs/throttler` 依赖）
- 修改: `apps/api/src/app.module.ts`
- 修改: `apps/api/src/modules/auth/auth.controller.ts`

**具体改动**:

1. 安装 `@nestjs/throttler` 和 `@nestjs/throttler-storage-redis`（如需 Redis 存储）
2. 在 `AppModule` 的 imports 中添加 `ThrottlerModule.forRoot({ ttl: 60, limit: 5 })`（每分钟最多 5 次请求）
3. 在 `AppModule` 的 providers 中添加 `APP_GUARD` 使用 `ThrottlerGuard`（全局生效）
4. 在 `AuthController` 的 `login` 方法上添加 `@Throttle({ default: { ttl: 60000, limit: 5 } })`（每分钟最多 5 次登录尝试）
5. 对登录失败的情况返回 429 Too Many Requests
6. 可选：添加账户锁定机制，连续 5 次失败后锁定 15 分钟

**验证方法**:
- 连续 5 次错误登录后，第 6 次返回 429
- 等待 1 分钟后可再次尝试
- 正确登录不受影响（5 次内成功则重置计数）

**依赖关系**: 无前置依赖

---

### 步骤 6.3: 教学代理端点授权检查（R-008, R-009）

**问题**: `POST /teaching-agents/review` 不检查提交归属，`POST /teaching-agents/collaborate` 不检查角色。

**涉及文件**:
- 修改: `apps/api/src/modules/memory/teaching-agents/teaching-agent.controller.ts`

**具体改动**:

1. **review 端点**: 在 `runReview` 方法中（第 66 行之后），查询 submission 后检查归属：
   - 如果 `user.role === student` 且 `submission.studentId !== user.id`，抛出 `ForbiddenException`
   - 教师可以评审任意提交
2. **collaborate 端点**: 在 `collaborate` 方法中添加角色检查：
   - 如果 `user.role` 既不是 student 也不是 teacher，抛出 `ForbiddenException`
   - 可选：为学生添加每日调用次数限制（如每天最多 10 次），防止 LLM 配额滥用
3. **question 端点**: 已有 studentId 归属校验（第 129 行），确认逻辑正确
4. **quest-complete 端点**: 已有 studentId 归属校验（第 175 行），确认逻辑正确

**验证方法**:
- 学生 A 调用 `POST /teaching-agents/review` 传入学生 B 的 submissionId，返回 403
- 教师可以评审任意提交
- 非学生/教师角色调用 collaborate，返回 403

**依赖关系**: 无前置依赖

---

### 步骤 6.4: CORS 白名单配置（R-012）

**问题**: `app.enableCors()` 无配置，允许所有来源。

**涉及文件**:
- 修改: `apps/api/src/main.ts`

**具体改动**:

1. 修改 `app.enableCors()` 为显式配置：
   ```
   app.enableCors({
     origin: process.env.CORS_ORIGINS?.split(",") ?? ["http://localhost:3000"],
     methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
     credentials: true,
     allowedHeaders: ["Authorization", "Content-Type", "Idempotency-Key"],
   });
   ```
2. 在 `.env` 文件中添加 `CORS_ORIGINS` 环境变量
3. 生产环境仅允许前端域名

**验证方法**:
- 从非白名单来源的请求被 CORS 拒绝
- 从白名单来源的请求正常工作
- 预检请求 (OPTIONS) 返回正确的 CORS 头

**依赖关系**: 无前置依赖

---

### 步骤 6.5: 将 TypeScript type 转为 class-validator DTO（R-015, A-003）

**问题**: 8 个请求体使用 TypeScript `type` 而非 class-validator `class`，ValidationPipe 不校验。

**涉及文件**:
- 修改: `apps/api/src/modules/memory/teaching-agents/teaching-agent.controller.ts`
- 修改: `apps/api/src/modules/memory/npc-conversation.controller.ts`
- 修改: `apps/api/src/modules/memory/memory.controller.ts`
- 修改: `apps/api/src/modules/chat/chat.controller.ts`

**具体改动**:

1. **teaching-agent.controller.ts**: 将 `ReviewBody`, `QuestionBody`, `QuestCompleteBody`, `CollaborateBody` 从 `type` 改为 `class`，添加 `@IsString()`, `@IsArray()` 等验证装饰器
2. **npc-conversation.controller.ts**: 将 `PostConversationBody` 改为 class，添加 `@IsOptional()`, `@IsString()` 装饰器
3. **memory.controller.ts**: 将 `ObserveBody`, `ReflectBody` 改为 class，添加 `@IsString()`, `@IsIn(["observation", "reflection", "plan"])`, `@IsNumber()` 等装饰器
4. **chat.controller.ts**: 将 `CreateChatMessageBody` 改为 class，添加 `@IsString()`, `@IsNotEmpty()` 装饰器

**验证方法**:
- 发送缺少必填字段的请求，返回 400
- 发送包含额外字段的请求（forbidNonWhitelisted 已启用），返回 400
- 发送合法请求，返回正常结果
- 运行 `pnpm --filter api test` 确认所有测试通过

**依赖关系**: 无前置依赖

---

### 步骤 6.6: NPC 对话 studentId 归属校验（R-021）

**问题**: NPC 对话端点接受 `studentId` 参数但不验证是否属于当前登录用户。

**涉及文件**:
- 修改: `apps/api/src/modules/memory/npc-conversation.controller.ts`

**具体改动**:

1. 在 `getConversation` 和 `postConversation` 方法中添加 `@CurrentUser()` 参数
2. 如果 `user.role === student` 且传入的 `studentId` 不等于 `user.id`，抛出 `ForbiddenException`
3. 如果 `user.role === teacher`，允许指定任意 studentId
4. 如果未传 studentId，使用 `user.id` 作为默认值

**验证方法**:
- 学生 A 传入学生 B 的 studentId 调用 NPC 对话，返回 403
- 学生使用自己的 studentId 正常对话
- 教师可以指定任意 studentId

**依赖关系**: 依赖步骤 6.5 完成（DTO 转换后才能添加 @CurrentUser）

---

### 步骤 6.7: 会话 token 安全存储（R-022, F-007, F-008）

**问题**: token 明文存储在 localStorage，Cookie 缺少 secure 标志，loadSession 不检查过期。

**涉及文件**:
- 修改: `apps/web/src/lib/session.ts`
- 修改: `apps/api/src/modules/auth/auth.controller.ts`

**具体改动**:

1. **后端**: 在 `login` 方法中使用 `@Res()` 设置 HttpOnly + Secure + SameSite cookie：
   - `httpOnly: true`（防止 XSS 读取）
   - `secure: process.env.NODE_ENV === "production"`（生产环境强制 HTTPS）
   - `sameSite: "lax"`（防止 CSRF）
   - `maxAge: 28800`（8 小时）
2. **前端**: `saveSession` 中不再手动设置 cookie（由后端 Set-Cookie 管理），仅保存到 localStorage 用于客户端 API 调用
3. **前端**: `loadSession` 中添加过期检查：读取 session 时检查 `expiresAt` 字段，过期则清除并返回 null
4. **前端**: 在 session 对象中添加 `expiresAt` 字段（从后端返回或前端计算）
5. **前端**: 添加 cookie secure 标志（如果前端仍需设置 cookie 作为 fallback）

**验证方法**:
- 浏览器开发者工具中 cookie 标记为 HttpOnly + Secure
- localStorage 中的 session 包含 expiresAt 字段
- 过期 session 被 loadSession 清除

**依赖关系**: 无前置依赖

---

### 步骤 6.8: Swagger UI 认证保护（R-028）

**问题**: Swagger UI 在 `/api-docs` 路径无认证保护。

**涉及文件**:
- 修改: `apps/api/src/main.ts`

**具体改动**:

1. 添加 Basic Auth 中间件保护 `/api-docs` 路径：
   ```
   import * as express from "express";
   import * as basicAuth from "express-basic-auth";
   
   // 在 SwaggerModule.setup 之前
   app.use(
     ["/api-docs", "/api-docs-json"],
     basicAuth({
       challenge: true,
       users: { admin: process.env.SWAGGER_PASSWORD || "changeme" },
     })
   );
   ```
2. 在 `.env` 中配置 `SWAGGER_PASSWORD`
3. 生产环境可考虑完全禁用 Swagger

**验证方法**:
- 访问 `/api-docs` 时弹出 Basic Auth 对话框
- 输入正确密码后可访问
- 输入错误密码返回 401

**依赖关系**: 无前置依赖

---

### 步骤 6.9: WebSocket 会话过期检查（R-029）

**问题**: WebSocket 连接时验证 session，但连接后不检查 session 是否过期。

**涉及文件**:
- 修改: `apps/api/src/modules/realtime/realtime.gateway.ts`

**具体改动**:

1. 在 `handleConnection` 中记录 session 的 `expiresAt` 时间
2. 设置定时器（setInterval），在 session 过期时间前 5 分钟断开连接
3. 添加心跳机制：服务端每 30 秒发送 ping，客户端需回复 pong，超时 2 次未回复则断开
4. 可选：客户端定期刷新 token，连接保持时重置 session 过期时间

**验证方法**:
- 连接建立后等待 session 过期，连接自动断开
- 心跳超时的连接被断开
- 正常使用中连接保持稳定

**依赖关系**: 依赖步骤 6.1 完成（房间隔离后再处理连接生命周期）

---

### 步骤 6.10: 工会页面认证检查（F-011）

**问题**: 工会页面 SSR 无认证检查。

**涉及文件**:
- 修改: `apps/web/src/app/guilds/page.tsx`

**具体改动**:

1. 在 Server Component 顶部调用 `getServerSession()` 获取当前 session
2. 如果 `session === null`，调用 `redirect("/login")` 重定向到登录页
3. 将 session.token 传递给 API 调用函数

**验证方法**:
- 未登录状态访问 `/guilds`，重定向到 `/login`
- 登录状态访问 `/guilds`，正常显示页面

**依赖关系**: 无前置依赖

---

### 步骤 6.11: Token 刷新机制（A-014）

**问题**: Token 8 小时硬过期，无刷新机制。

**涉及文件**:
- 修改: `apps/api/src/modules/auth/auth.service.ts`
- 修改: `apps/api/src/modules/auth/auth.controller.ts`

**具体改动**:

1. **后端**: 在 `AuthService` 中添加 `refreshSession(token)` 方法：
   - 查找 session，检查是否在过期前 1 小时内
   - 如果是，延长 `expiresAt` 8 小时（滑动续期）
   - 返回更新后的 session
2. **后端**: 添加 `POST /auth/refresh` 端点
3. **前端**: 在 API 客户端拦截器中，当收到 401 响应时，先尝试调用 `/auth/refresh`，成功后重试原请求
4. **前端**: 在 `loadSession` 中检查是否需要刷新（距过期不足 1 小时时自动刷新）

**验证方法**:
- 使用 7.5 小时前的 token，API 调用前自动刷新
- 刷新后返回新的 token（或延长了过期时间）
- 超过 8 小时的 token 无法刷新，返回 401

**依赖关系**: 依赖步骤 6.7 完成

---

### 步骤 6.12: 统一 Authorization Header 解析（A-019）

**问题**: `GET /auth/session` 手动解析 Authorization header，未使用 Guard。

**涉及文件**:
- 修改: `apps/api/src/modules/auth/auth.controller.ts`

**具体改动**:

1. 为 `getSession` 方法添加 `@UseGuards(AuthGuard)` 装饰器
2. 使用 `@CurrentUser()` 装饰器获取已认证用户，替代手动解析 header
3. 移除 `@Headers("authorization")` 参数和手动 token 解析逻辑
4. AuthGuard 内部已调用 `getSession` 并将结果存入 `request.authSession`，直接返回即可

**验证方法**:
- `GET /auth/session` 携带有效 Bearer token，返回 200 和用户信息
- 不携带 token，返回 401
- 携带过期 token，返回 401

**依赖关系**: 无前置依赖

---

## 7. 原子化实施步骤 — 性能与数据一致性

### 步骤 7.1: 修复 Promise.race 孤立 rejection（R-016）

**问题**: `submissions.controller.ts` 中 `Promise.race` 超时后，原 Promise 仍在执行并最终 reject，产生 unhandled rejection。

**涉及文件**:
- 修改: `apps/api/src/modules/submissions/submissions.controller.ts`

**具体改动**:

1. 使用 `AbortController` 替代 `Promise.race` 模式：
   ```
   const controller = new AbortController();
   const timeout = setTimeout(() => controller.abort(), 2000);
   try {
     queue = await this.reviewQueue.enqueue(created.submission.id);
     queueAvailable = true;
   } catch {
     // Redis unavailable -- fall back to direct processing
   } finally {
     clearTimeout(timeout);
   }
   ```
2. 或者使用 `Promise.allSettled` 模式：将 enqueue 和 timeout 作为两个 promise，取第一个 fulfilled 的结果，同时 catch 另一个的 rejection

**验证方法**:
- Redis 不可用时，2 秒超时后正常降级，无 unhandled rejection 告警
- Redis 可用时，正常入队
- 运行 `pnpm --filter api test` 确认无 warning

**依赖关系**: 无前置依赖

---

### 步骤 7.2: 封装 safeAsync 工具函数消除 void 模式（R-017）

**问题**: 10+ 处 `queueMicrotask(() => { void someAsyncCall() })` 模式导致 unhandled rejection 被静默吞没。

**涉及文件**:
- 新建: `apps/api/src/utils/async-utils.ts`
- 修改: `apps/api/src/modules/submissions/submissions.controller.ts`
- 修改: `apps/api/src/modules/reviews/reviews.controller.ts`
- 修改: `apps/api/src/modules/memory/memory.service.ts`
- 修改: `apps/api/src/modules/memory/teaching-agents/teaching-agent.controller.ts`

**具体改动**:

1. 新建 `apps/api/src/utils/async-utils.ts`，封装 `safeAsync` 工具函数：
   ```
   export function safeAsync<T>(
     fn: () => Promise<T>,
     context?: string
   ): void {
     fn().catch((error) => {
       const logger = new Logger("safeAsync");
       logger.error(
         `Unhandled async error${context ? ` in ${context}` : ""}: ${error instanceof Error ? error.message : String(error)}`
       );
     });
   }
   ```
2. 将所有 `queueMicrotask(() => { void this.someMethod() })` 替换为 `safeAsync(() => this.someMethod(), "context description")`
3. 具体替换位置（10 处）：
   - `submissions.controller.ts:179` - reviewProcessingService.processSubmissionReview
   - `submissions.controller.ts:184` - memoryService.observe
   - `submissions.controller.ts:194` - triggerSubmissionReviewSop
   - `submissions.controller.ts:198` - broadcastAgentStatus
   - `reviews.controller.ts:164` - memoryService.observe
   - `reviews.controller.ts:173` - broadcastAgentStatus
   - `memory.service.ts:58` - maybeAutoReflect
   - `teaching-agent.controller.ts:97` - memoryService.observe (review SOP)
   - `teaching-agent.controller.ts:142` - memoryService.observe (question SOP)
   - `teaching-agent.controller.ts:202` - memoryService.observe (quest-complete SOP)

**验证方法**:
- Node.js 进程日志中不再出现 `Unhandled promise rejection` 警告
- 异步操作失败时有明确的错误日志（含上下文信息）
- 正常流程不受影响

**依赖关系**: 无前置依赖

---

### 步骤 7.3: 添加 LLM 调用超时配置（R-023）

**问题**: `ark-adapter.ts` 中 OpenAI client 无超时配置，LLM 卡住时请求永久挂起。

**涉及文件**:
- 修改: `apps/api/src/modules/memory/llm/ark-adapter.ts`

**具体改动**:

1. 在 OpenAI client 初始化时添加 timeout 配置：
   ```
   const arkClient = new OpenAI({
     baseURL: process.env.ARK_BASE_URL || "...",
     apiKey: process.env.ARK_API_KEY || "",
     timeout: 30000,  // 30 秒超时
     maxRetries: 2,    // 最多重试 2 次
   });
   ```
2. 在 `chat` 和 `chatMultimodal` 函数中添加 `AbortSignal.timeout` 作为额外保护：
   ```
   const response = await arkClient.chat.completions.create({
     model: ARK_MODEL,
     messages,
   }, { signal: AbortSignal.timeout(30000) });
   ```
3. 在 catch 块中区分超时错误和其他错误，超时返回有意义的错误信息

**验证方法**:
- LLM 服务不可达时，30 秒后请求超时返回错误，而非永久挂起
- 超时错误日志中包含 "timeout" 关键字
- 正常 LLM 调用不受影响

**依赖关系**: 无前置依赖

---

### 步骤 7.4: 评审列表分页（R-024）

**问题**: `GET /reviews` 一次性加载所有评审记录，无分页。

**涉及文件**:
- 修改: `apps/api/src/modules/reviews/reviews.controller.ts`

**具体改动**:

1. 在 `list` 方法中添加 `@Query("cursor")` 和 `@Query("limit")` 参数
2. 使用 cursor-based 分页：
   ```
   const limit = Math.min(Math.max(parseInt(queryLimit || "20", 10), 1), 100);
   const reviews = await this.prisma.reviewResult.findMany({
     take: limit + 1,
     ...(cursor ? { cursor: { submissionId: cursor }, skip: 1 } : {}),
     include: { ... },
     orderBy: { submission: { submittedAt: "desc" } },
   });
   const hasMore = reviews.length > limit;
   const items = hasMore ? reviews.slice(0, limit) : reviews;
   ```
3. 返回 `{ items, hasMore, nextCursor: hasMore ? items[items.length - 1].submissionId : null, summary }`
4. summary 统计仍然基于全量数据（使用 `count` 查询而非加载全部记录）

**验证方法**:
- 默认返回 20 条记录
- 携带 cursor 返回下一页
- summary 统计数据准确（基于 count 查询）
- `limit=100` 返回最多 100 条，`limit=999` 被截断为 100

**依赖关系**: 无前置依赖

---

### 步骤 7.5: getSession 精简字段加载（R-025）

**问题**: `getSession` 使用 `include: { user: true }` 加载 User 全字段，包括 passwordHash。

**涉及文件**:
- 修改: `apps/api/src/modules/auth/auth.service.ts`

**具体改动**:

1. 将 `include: { user: true }` 改为 `include: { user: { select: { id: true, role: true, displayName: true } } }`
2. 确保返回的 session 对象中不包含 passwordHash

**验证方法**:
- `getSession` 返回的 user 对象中不包含 passwordHash 字段
- 正常登录流程不受影响
- 运行 `pnpm --filter api test -- auth-flow`

**依赖关系**: 无前置依赖

---

### 步骤 7.6: 过期会话定时清理（R-026）

**问题**: 过期的 UserSession 记录不被清理，数据库持续膨胀。

**涉及文件**:
- 新建: `apps/api/src/modules/auth/session-cleanup.service.ts`
- 修改: `apps/api/src/app.module.ts`

**具体改动**:

1. 新建 `SessionCleanupService`，实现 `@Cron` 定时任务（需安装 `@nestjs/schedule`）：
   ```
   @Injectable()
   export class SessionCleanupService implements OnModuleInit {
     constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}
     
     @Cron("0 */1 * * *")  // 每小时执行
     async cleanupExpiredSessions() {
       const result = await this.prisma.userSession.deleteMany({
         where: { expiresAt: { lt: new Date() } }
       });
       if (result.count > 0) {
         logger.log(`Cleaned up ${result.count} expired sessions`);
       }
     }
   }
   ```
2. 安装 `@nestjs/schedule` 并在 `AppModule` 中导入 `ScheduleModule.forRoot()`
3. 在 `AppModule` 的 providers 中添加 `SessionCleanupService`

**验证方法**:
- 手动创建过期 session 记录，等待定时任务执行后确认被删除
- 查看日志中有清理记录
- 活跃 session 不受影响

**依赖关系**: 需安装 `@nestjs/schedule` 依赖

---

### 步骤 7.7: lastReflectTime Map 限制增长（R-030）

**问题**: `memory.service.ts` 中 `lastReflectTime` Map 永不清理，随学生数量无限增长。

**涉及文件**:
- 修改: `apps/api/src/modules/memory/memory.service.ts`

**具体改动**:

1. 方案 A（推荐）: 使用 LRU 缓存替代 Map：
   - 安装 `lru-cache` 包
   - 将 `private lastReflectTime = new Map<string, number>()` 替换为 `private lastReflectTime = new LRUCache<string, number>({ max: 1000, ttl: REFLECT_COOLDOWN_MS })`
   - 修改 `get` 和 `set` 调用为 `this.lastReflectTime.get()` 和 `this.lastReflectTime.set()`
2. 方案 B（轻量）: 定期清理：
   - 在 `maybeAutoReflect` 方法中，每次执行时检查 Map 大小，超过 1000 时清理超过 1 小时的条目

**验证方法**:
- 创建 1000+ 学生的反思记录，Map 不超过设定上限
- 冷却机制仍然正常工作
- 内存占用稳定

**依赖关系**: 无前置依赖（方案 A 需安装 `lru-cache`）

---

### 步骤 7.8: 反思洞察批量写入（R-031）

**问题**: `reflect` 方法中逐条 `create` 写入洞察，N 次数据库往返。

**涉及文件**:
- 修改: `apps/api/src/modules/memory/memory.service.ts`

**具体改动**:

1. 将第 164-173 行的 for 循环替换为 `createMany`：
   ```
   const insightsToPersist = insights.slice(0, REFLECTION_INSIGHT_COUNT).map(
     (insight) => ({
       studentId,
       type: "reflection" as const,
       content: insight,
       importance: 7.0,
     })
   );
   await this.prisma.agentMemory.createMany({
     data: insightsToPersist,
   });
   ```
2. 确保返回的 insights 列表仍然正确

**验证方法**:
- 反思触发后，所有洞察被写入数据库
- 数据库操作次数从 N 次降为 1 次
- 运行 `pnpm --filter api test -- memory`

**依赖关系**: 无前置依赖

---

### 步骤 7.9: retrieve limit 边界校验（R-032）

**问题**: `memory.controller.ts` 中 `parseInt(limit, 10)` 无边界校验。

**涉及文件**:
- 修改: `apps/api/src/modules/memory/memory.controller.ts`

**具体改动**:

1. 将第 89 行 `const parsedLimit = limit ? parseInt(limit, 10) : 30;` 改为：
   ```
   const parsedLimit = clamp(limit ? parseInt(limit, 10) : 30, 1, 100);
   ```
2. 添加 `clamp` 工具函数：`const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max);`
3. 对 NaN 情况进行保护：`const raw = parseInt(limit, 10); const parsedLimit = isNaN(raw) ? 30 : clamp(raw, 1, 100);`

**验证方法**:
- `limit=0` 返回最少 1 条
- `limit=999999` 返回最多 100 条
- `limit=abc` 返回默认 30 条
- `limit=50` 正常返回 50 条

**依赖关系**: 无前置依赖

---

### 步骤 7.10: world controller 精简字段加载（R-036）

**问题**: `world.controller.ts` 使用 `include: { owner: true }` 加载完整 User 记录，包括 passwordHash。

**涉及文件**:
- 修改: `apps/api/src/modules/world/world.controller.ts`

**具体改动**:

1. 将 `include: { owner: true }` 改为：
   ```
   include: {
     owner: {
       select: {
         id: true,
         displayName: true,
         isOnline: true,
       }
     }
   }
   ```
2. 确保 `getWorld` 返回的数据结构不变（仅使用 id, displayName, isOnline）

**验证方法**:
- `GET /world` 返回的 homesteads 中不包含 passwordHash
- 页面显示正常
- 运行 `pnpm --filter api test`

**依赖关系**: 无前置依赖

---

## 8. 实施优先级与依赖关系

### 8.1 优先级分组

| 优先级 | 步骤编号 | 涉及问题 | 预计工时 | 依赖 |
|--------|---------|---------|---------|------|
| P0-Sprint1 | 5.1 | R-001 | 2h | 无 |
| P0-Sprint1 | 5.2 | R-002, A-020 | 1h | 5.1 |
| P0-Sprint1 | 5.3 | R-003 | 2h | 5.2 |
| P0-Sprint1 | 5.4 | R-018, A-017 | 2h | 无 |
| P0-Sprint2 | 5.5 | R-019, A-007 | 3h | 无 |
| P0-Sprint2 | 5.6 | R-020 | 0.5h | 无 |
| P0-Sprint2 | 5.7 | F-003 | 1h | 无 |
| P0-Sprint2 | 5.8 | F-015 | 1h | 无 |
| P1-Sprint3 | 6.1 | R-004, A-005 | 3h | 无 |
| P1-Sprint3 | 6.2 | R-007 | 2h | 无 |
| P1-Sprint3 | 6.3 | R-008, R-009 | 1h | 无 |
| P1-Sprint3 | 6.4 | R-012 | 0.5h | 无 |
| P1-Sprint3 | 6.5 | R-015, A-003 | 3h | 无 |
| P1-Sprint4 | 6.6 | R-021 | 1h | 6.5 |
| P1-Sprint4 | 6.7 | R-022, F-007, F-008 | 3h | 无 |
| P1-Sprint4 | 6.8 | R-028 | 0.5h | 无 |
| P1-Sprint4 | 6.9 | R-029 | 2h | 6.1 |
| P1-Sprint4 | 6.10 | F-011 | 0.5h | 无 |
| P1-Sprint4 | 6.11 | A-014 | 3h | 6.7 |
| P1-Sprint4 | 6.12 | A-019 | 0.5h | 无 |
| P2-Sprint5 | 7.1 | R-016 | 1h | 无 |
| P2-Sprint5 | 7.2 | R-017 | 3h | 无 |
| P2-Sprint5 | 7.3 | R-023 | 1h | 无 |
| P2-Sprint5 | 7.4 | R-024 | 2h | 无 |
| P2-Sprint6 | 7.5 | R-025 | 0.5h | 无 |
| P2-Sprint6 | 7.6 | R-026 | 2h | 无 |
| P2-Sprint6 | 7.7 | R-030 | 1h | 无 |
| P2-Sprint6 | 7.8 | R-031 | 0.5h | 无 |
| P2-Sprint6 | 7.9 | R-032 | 0.5h | 无 |
| P2-Sprint6 | 7.10 | R-036 | 0.5h | 无 |

### 8.2 依赖关系图

```
5.1 (Worker启动) --> 5.2 (移除硬编码) --> 5.3 (SOP更新ReviewResult)
5.5 (幂等性) [独立]
5.7 (前端suggestedScore) + 5.8 (deriveSummary) [可合并]
6.5 (DTO转换) --> 6.6 (NPC studentId校验)
6.7 (Token安全) --> 6.11 (Token刷新)
6.1 (WS房间隔离) --> 6.9 (WS过期检查)
其余步骤均独立
```

### 8.3 建议实施顺序

1. **Sprint 1 (P0, 约7h)**: 步骤 5.1 -> 5.2 -> 5.3 -> 5.4 — 修复评审流程核心闭环
2. **Sprint 2 (P0, 约5.5h)**: 步骤 5.5 -> 5.6 -> 5.7+5.8 — 修复数据完整性和前端
3. **Sprint 3 (P1, 约9.5h)**: 步骤 6.1 -> 6.2 -> 6.3 -> 6.4 -> 6.5 — 安全基线
4. **Sprint 4 (P1, 约10h)**: 步骤 6.6 -> 6.7 -> 6.8 -> 6.9 -> 6.10 -> 6.11 -> 6.12 — 认证增强
5. **Sprint 5 (P2, 约7h)**: 步骤 7.1 -> 7.2 -> 7.3 -> 7.4 — 性能基线
6. **Sprint 6 (P2, 约4.5h)**: 步骤 7.5 -> 7.6 -> 7.7 -> 7.8 -> 7.9 -> 7.10 — 数据一致性

---

## 9. 验收标准汇总

### 9.1 评审流程系统验收标准

| 编号 | 验收条件 | 验证方法 | 对应步骤 |
|------|---------|---------|---------|
| AC-R1 | Redis 可用时，提交后 5 秒内 ReviewResult 状态从 queued 变为 ai_reviewed | Redis CLI 或数据库查询确认 | 5.1 |
| AC-R2 | AI 评审后 finalScore 为 null，suggestedScore 有值 | 数据库查询确认 | 5.2 |
| AC-R3 | SOP 评审后 ReviewResult 表状态更新为 ai_reviewed | API 调用后数据库查询 | 5.3 |
| AC-R4 | 并发调用 POST /reviews/decide 只有一个成功 | 并发测试 | 5.4 |
| AC-R5 | 同一学生同一 dayId 第二次提交返回 409 | API 测试 | 5.5 |
| AC-R6 | artifacts 包含非法字段返回 400 | API 测试 | 5.6 |
| AC-R7 | 教师点"通过"时使用 suggestedScore 而非 0 分 | 前端 E2E 测试 | 5.7 |
| AC-R8 | 修改 decision label 文本后统计仍正确 | 前端单元测试 | 5.8 |

### 9.2 安全与认证验收标准

| 编号 | 验收条件 | 验证方法 | 对应步骤 |
|------|---------|---------|---------|
| AC-S1 | 聊天消息仅推送到同房间用户 | WebSocket 测试 | 6.1 |
| AC-S2 | 连续 5 次错误登录返回 429 | API 测试 | 6.2 |
| AC-S3 | 学生 A 不能触发学生 B 的提交评审 | API 测试 | 6.3 |
| AC-S4 | 非白名单来源的 CORS 请求被拒绝 | curl 测试 | 6.4 |
| AC-S5 | 缺少必填字段的请求返回 400 | API 测试 | 6.5 |
| AC-S6 | 学生不能冒充其他学生与 NPC 对话 | API 测试 | 6.6 |
| AC-S7 | Cookie 标记为 HttpOnly + Secure | 浏览器开发者工具 | 6.7 |
| AC-S8 | Swagger 页面需要 Basic Auth | 浏览器访问 | 6.8 |
| AC-S9 | WebSocket 连接在 session 过期后断开 | 超时测试 | 6.9 |
| AC-S10 | 未登录访问 /guilds 重定向到 /login | 浏览器测试 | 6.10 |
| AC-S11 | Token 过期前 1 小时自动刷新 | API 测试 | 6.11 |
| AC-S12 | GET /auth/session 使用 Guard 而非手动解析 | 代码审查 | 6.12 |

### 9.3 性能与数据一致性验收标准

| 编号 | 验收条件 | 验证方法 | 对应步骤 |
|------|---------|---------|---------|
| AC-P1 | Redis 超时时无 unhandled rejection 告警 | 日志检查 | 7.1 |
| AC-P2 | 异步操作失败有明确错误日志 | 日志检查 | 7.2 |
| AC-P3 | LLM 调用 30 秒超时返回错误 | 超时测试 | 7.3 |
| AC-P4 | 评审列表支持 cursor 分页 | API 测试 | 7.4 |
| AC-P5 | getSession 不返回 passwordHash | API 响应检查 | 7.5 |
| AC-P6 | 过期 session 被定时清理 | 数据库查询 | 7.6 |
| AC-P7 | lastReflectTime Map 不超过 1000 条 | 内存分析 | 7.7 |
| AC-P8 | 反思洞察使用 createMany 批量写入 | 代码审查 | 7.8 |
| AC-P9 | limit 参数被 clamp 到 1-100 范围 | API 测试 | 7.9 |
| AC-P10 | GET /world 不返回 passwordHash | API 响应检查 | 7.10 |

---

## 附录 A: 需要新增的依赖

| 依赖包 | 用途 | 安装命令 |
|--------|------|---------|
| @nestjs/throttler | 登录速率限制 (步骤 6.2) | `pnpm --filter api add @nestjs/throttler` |
| @nestjs/schedule | 定时任务 (步骤 7.6) | `pnpm --filter api add @nestjs/schedule` |
| express-basic-auth | Swagger 保护 (步骤 6.8) | `pnpm --filter api add express-basic-auth` |
| lru-cache | Map 限制 (步骤 7.7) | `pnpm --filter api add lru-cache` |

## 附录 B: 需要新增的环境变量

| 变量名 | 用途 | 示例值 |
|--------|------|--------|
| CORS_ORIGINS | CORS 白名单 (步骤 6.4) | `http://localhost:3000,https://app.example.com` |
| SWAGGER_PASSWORD | Swagger 认证密码 (步骤 6.8) | `your-secure-password` |
| LLM_TIMEOUT_MS | LLM 超时毫秒数 (步骤 7.3) | `30000` |

---

> **文档结束**  
> 本 PRD 涵盖 38 个后端核心问题，拆解为 30 个原子化实施步骤，预计总工时约 44 小时，分 6 个 Sprint 完成。
