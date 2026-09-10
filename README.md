# Agent Guild RPG

面向教学场景的像素风 Web 端 RPG Agent 世界。

## 项目简介

Agent Guild RPG 是一个把 Agent 学习、课程任务、作品提交、AI 初评、教师裁定和同伴协作游戏化的教学平台。学生在像素风“主城区”中接收课程任务、接入自己的本机 Agent、完成 Day 关卡并提交成果；老师通过工作台控制课堂、查看学情、处理评审和学生求助。

它不是纯娱乐 RPG：课程、权限、评分、积分和任务状态以服务端业务数据为准，像素世界是对这些教学流程的可视化入口。

## 当前状态

仓库目前处于持续开发中的 MVP/原型阶段，已经包含：

- 学生和教师登录、注册及会话管理
- 主城区 Phaser 世界壳，以及大厅、工位区、协作室、评审区
- Day 课程任务、成果提交、AI 初评和教师最终裁定
- 工会、聊天室、房间授权和实时状态同步
- 课堂阶段控制、学生求助、教师/助教处理和审计事件
- 学生本机 Agent Connector，可受控接入 Codex、Claude Code 或白名单 Provider
- Agent 记忆、NPC 对话、学习洞察和教学 Agent 扩展接口

当前实现仍需要在真实课堂部署前继续完成安全审查、生产配置、容量验证和端到端回归。

## 用户流程

```text
老师创建/解锁课程 Day
        ↓
学生进入主城区并接入本机 Agent
        ↓
Agent 执行任务，学生确认并提交成果
        ↓
AI 初评 → 教师裁定
        ↓
获得课程进度、协作贡献和下一阶段解锁
```

## 仓库结构

| 目录 | 用途 |
| --- | --- |
| `apps/web` | Next.js 前端、Phaser 世界、学生页和教师工作台 |
| `apps/api` | NestJS API、Prisma 数据库、实时服务和评审队列 |
| `apps/agent-connector` | 学生本机 Agent 接入、任务领取和受控进程执行 |
| `packages/contracts` | 前后端共享的 Zod 契约和 TypeScript 类型 |
| `docs` | 产品、架构、课堂流程和视觉设计文档 |
| `prototypes` | 不连接正式 API 的交互/视觉判断原型 |
| `artifacts` | 验收截图等非运行时产物 |

## 技术架构

- 前端：Next.js 15、React 19、Phaser、Socket.IO Client
- 后端：NestJS、Prisma、Socket.IO
- 数据：本地开发使用 SQLite；Docker 课堂环境使用 PostgreSQL 16
- 异步处理：Redis + BullMQ，用于 AI 评审队列
- 工程：pnpm workspace monorepo，支持 OpenNext/Cloudflare 构建

业务状态由 API 和数据库持久化，Socket.IO 只广播实时变化；浏览器断线后仍可通过 REST 数据继续工作。Agent Connector 通过出站长轮询领取任务，不要求学生电脑开放入站端口。

## 快速开始

环境要求：Node.js、pnpm 10、可选的 Redis，以及用于浏览器测试的 Playwright Chromium。

```bash
pnpm install
pnpm --filter web exec playwright install chromium
export DATABASE_URL="file:$PWD/apps/api/prisma/dev.db"
pnpm db:reset
pnpm dev:api
pnpm dev:web
```

启动后访问：

- Web：`http://localhost:3000`
- API：`http://localhost:3001`

AI 评审队列需要 Redis 时，另开终端运行：

```bash
export REDIS_URL="redis://localhost:6379"
pnpm dev:worker
```

完整 Docker 部署、环境变量、Connector 接入方式和容量验收命令见本文后续章节。

## 重要安全说明

- 不要提交 `.env`、数据库文件、真实 API Key、Connector 签名密钥或生产密码。
- `AGENT_GUILD_CONNECTION_CREDENTIAL` 是一次性短期凭证，不是登录密码；生产环境必须配置独立签名密钥和公开 API 地址。
- Connector 只允许在受控工作区内执行命令，并对 Provider、参数、超时、输出长度和可执行文件进行限制。
- 本地 seed 中的账号密码仅用于开发和自动化测试，不能直接用于生产环境。

## 当前仓库包含什么

- `apps/web`: Next.js + Phaser 的前端世界壳与教学页面
- `apps/api`: NestJS 后端 API、数据库、队列与实时服务
- `apps/agent-connector`: 学生本机 Agent 配对、心跳和受限命令执行
- `packages/contracts`: 前后端共享的 Zod 契约
- `docs/`: 产品、架构、使用说明和开发计划
- `artifacts/`: 不参与运行时的验收截图与视觉过程产物

## 本地开发

1. 安装依赖

```bash
pnpm install
```

2. 安装 Playwright Chromium 浏览器

```bash
pnpm --filter web exec playwright install chromium
```

3. 为 Prisma 和可选队列准备环境变量

```bash
export DATABASE_URL="file:$PWD/apps/api/prisma/dev.db"
# 可选；不配置时本地 API 不启动评审 Worker
export REDIS_URL="redis://localhost:6379"
```

本地开发和自动化测试继续使用 `apps/api/prisma/schema.prisma` 的 SQLite；Docker 课堂运行使用独立的 `apps/api/prisma/postgresql/schema.prisma` 与 PostgreSQL migration。两份 schema 由测试锁定为仅 datasource provider 不同。

4. 初始化本地 SQLite 教学快照

```bash
pnpm db:reset
```

`db:reset` 会重建 `apps/api/prisma/dev.db` 并写入一套干净的教师、学生、工会、课堂和评审数据。需要保留当前数据库时，可传入临时路径：

```bash
DATABASE_PATH=/tmp/agent-guild-dev.db ./scripts/reset-dev-db.sh
```

本次 Agent 编排和多层记忆作用域新增了 `AgentRunSnapshot` 及若干 scope 字段。已有本地数据库不会由应用启动过程自动改表；开发环境请先备份需要保留的数据，再显式执行上述 `db:reset`。生产环境应生成并审查 Prisma migration，禁止直接重置生产库。

## Agent 编排与本机 Provider

教师身份可通过 `/agent-orchestration` 接口创建、查询、调度、暂停、恢复和取消运行。任务、DAG 依赖、执行尝试和租约均持久化到 Prisma；API 重启后，过期租约会被回收并按策略重试。

`apps/agent-connector` 已支持在受限工作区内启动 Codex、Claude 或显式白名单的自研 Provider，并提供超时、取消、输出上限、敏感信息脱敏及结构化事件上报。Connector 通过 `/agent-connectors/tasks/*` 出站长轮询领取自己的任务，无需学生电脑开放入站端口；租约为 60 秒、每 15 秒续租，具体参数见 `apps/agent-connector/README.md`。

默认连接命令会声明 `events,agent-task,provider-process` 能力并进入自主 Worker 模式：保持 API 心跳、自动领取任务、调用本地 Provider、续租并回传结果。浏览器页面只展示和签发连接凭证，不会绕过 Connector 在浏览器里直接执行本机命令。

教师工作台的“学生 Agent 任务派发”会把带学生、课程、Day、Provider 和能力范围的任务写入控制面；学生可在 `/agent-team` 查看自己的领取/执行状态。Connector 完成后，平台先保存退出码、输出、耗时和截断状态，学生核对并填写学习反思后才会生成正式提交并进入 AI 初评队列，最终仍由老师裁定。

单 API 课堂如果多个学生共享同一个 Provider 账号，可选配置 RPM/TPM 令牌桶；学生各自使用独立账号时无需配置：

```bash
export AGENT_PROVIDER_RATE_LIMITS='{"codex":{"rpm":60,"tpm":120000}}'
```

学生在主城区点击“生成连接凭证”后，只需把页面给出的 `AGENT_GUILD_CONNECTION_CREDENTIAL='agc1....'` 命令提供给本机 Connector。凭证绑定学生、服务端地址和十分钟有效期，且只能兑换一次 Connector token；不包含用户登录密码。生产环境必须配置 `CONNECTOR_PUBLIC_API_URL` 和 `CONNECTOR_CREDENTIAL_SIGNING_SECRET`。

局域网访问时，Web 端会在检测到 API 地址仍为 `localhost` 时自动改用当前页面所在主机的 `3001` 端口，避免其他电脑把请求发到自己的 localhost。Docker 部署则应将 `PUBLIC_API_URL` 设置为宿主机局域网地址，例如 `http://192.168.3.200:3001`。

## Redis 评审队列

评审队列使用 Redis + BullMQ。API 只负责接收提交和入队，评审由独立 Worker 完成；Redis 不可用时提交仍可持久化等待恢复，不会在 HTTP 进程内突然并发调用模型。

```bash
export REDIS_URL="redis://localhost:6379"
pnpm dev:api
pnpm dev:worker
```

Worker 默认并发数为 `4`，可通过 `REVIEW_WORKER_CONCURRENCY` 调整。任务最多尝试三次并采用指数退避，连续失败后进入 `needs_teacher` 供老师人工处理。

5. 分别启动 API 与 Web

```bash
pnpm dev:api
pnpm dev:web
```

默认地址：

- Web: `http://localhost:3000`
- API: `http://localhost:3001`

## 本机 Docker 部署

当前 Docker 方案固定使用以下结构：Web `3000`、API `3001`、独立评审 Worker、Redis 和 PostgreSQL 16。SQLite 只用于本地开发与自动化测试，不再作为40人课堂运行数据库。

前置条件：

- Docker Engine
- Docker Compose v2 插件（命令必须能执行 `docker compose version`）

如果 Docker Hub 临时返回 EOF，可只对这两个基础镜像使用一次性镜像代理，拉取后重新打回官方镜像名；不需要修改全局 Docker daemon：

```bash
docker pull docker.1ms.run/library/postgres:16-alpine
docker tag docker.1ms.run/library/postgres:16-alpine postgres:16-alpine
docker pull docker.1ms.run/library/redis:7.4-alpine
docker tag docker.1ms.run/library/redis:7.4-alpine redis:7.4-alpine
```

第三方镜像代理仅用于本地网络故障时临时拉取；正式环境应使用已校验摘要的内部镜像仓库。

首次部署：

```bash
cp .env.docker.example .env.docker
```

编辑 `.env.docker`，至少替换下面三个占位值；真实密钥不得提交到仓库：

```bash
CONNECTOR_CREDENTIAL_SIGNING_SECRET=使用安全随机值
REGISTRATION_INTERNAL_CODE=使用私有注册码
POSTGRES_PASSWORD=使用安全随机值
```

当前采用单注册码模式：通过 `REGISTRATION_INTERNAL_CODE` 校验的新学生会自动加入“船说agent第一期班”。注册码仍只由环境变量提供，数据库只保存班级归属，不保存注册码明文。


构建镜像、执行 migration，并仅在空数据库中写入教学样例：

```bash
docker compose --env-file .env.docker build
docker compose --env-file .env.docker run --rm migrate
docker compose --env-file .env.docker --profile tools run --rm seed
docker compose --env-file .env.docker up -d
```

`seed` 会先检查用户数量；数据库已经有用户时会拒绝重复写入，不会覆盖现有数据。正式环境可以跳过 `seed`。API 启动过程不会执行 `reset-dev-db.sh`，数据库升级只使用已提交并审查的 `prisma migrate deploy`。

检查服务：

```bash
curl --fail http://127.0.0.1:3001/health/ready
curl --fail http://127.0.0.1:3000/login
docker compose --env-file .env.docker ps
```

停止服务但保留 PostgreSQL 和 Redis 数据：

```bash
docker compose --env-file .env.docker down
```

不要使用 `down -v`，否则会删除 PostgreSQL 和 Redis 持久卷。生产环境还需要为 `postgres-data` 卷建立定期备份。

容器内外 API 地址已分离：浏览器使用构建参数 `NEXT_PUBLIC_API_BASE_URL`，Next.js 服务端使用 `API_INTERNAL_BASE_URL=http://api:3001`，避免容器中的 `localhost` 指向错误服务。

注意：当前机器如果只有 Docker Engine、没有 Compose 插件，可以单独构建镜像，但不能执行上述一键编排命令；需先安装与 Docker CLI 匹配的 Compose v2/Buildx 插件。

## 测试命令

- 工作区测试：`pnpm test`
- Web smoke test：`pnpm test:e2e`
- 工作区构建：`pnpm build`
- Playwright 会自动拉起独立的 Web 服务：`http://localhost:3100`，并在 `3101` 启动带临时 SQLite 数据库的 API，不占用本地开发 Web `3000` 或 API `3001`；测试结束后临时数据库会自动删除

如果只想运行单个 smoke 用例，也可以执行：

```bash
pnpm --filter web exec playwright test tests/e2e/smoke.spec.ts
```

课堂指挥台闭环使用 `apps/api/prisma/seed.ts` 中的教师、学生和助教快照；课堂阶段/求助流程不依赖 Redis。Playwright 会自动创建临时数据库并启动独立 API（`3101`）与 Web（`3100`），所以不需要手动启动开发 API，也不会污染 `apps/api/prisma/dev.db`：

```bash
pnpm --filter contracts test
pnpm --filter api exec vitest run test/contracts/database-shape.spec.ts test/classroom-flow.spec.ts test/realtime.spec.ts
pnpm --filter web exec playwright test tests/e2e/classroom-flow.spec.ts
```

## 本地容量验收

容量脚本不会默认运行，也不会接受远程地址。必须同时声明目标是 localhost 临时环境、允许写入，并提供本地凭证 fixture：

```bash
CAPACITY_TEST_OPT_IN=I_UNDERSTAND_THIS_IS_A_LOAD_TEST \
CAPACITY_TARGET_IS_EPHEMERAL=1 \
CAPACITY_ALLOW_WRITES=1 \
CAPACITY_SUBMISSIONS_FILE=/tmp/submissions-40.json \
pnpm test:capacity:40

CAPACITY_TEST_OPT_IN=I_UNDERSTAND_THIS_IS_A_LOAD_TEST \
CAPACITY_TARGET_IS_EPHEMERAL=1 \
CAPACITY_ALLOW_WRITES=1 \
CAPACITY_CONNECTORS_FILE=/tmp/connectors-120.json \
CAPACITY_DAY_ID=day-1 \
CAPACITY_DURATION_SECONDS=1800 \
pnpm test:capacity:120
```

40人 fixture 是40条 `{ "token": "...", "body": { ...提交字段 } }`；Connector fixture 是120条 `{ "connectorToken": "..." }`。fixture 含临时凭证，禁止提交到仓库。
