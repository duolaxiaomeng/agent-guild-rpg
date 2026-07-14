# Agent Guild RPG

面向教学场景的像素风 Web 端 RPG Agent 世界。

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
# 可选；不配置时评审队列会使用同步降级路径
export REDIS_URL="redis://localhost:6379"
```

当前 Prisma schema 使用 SQLite，不能直接填 PostgreSQL URL。SQLite 适合本机和单实例 Docker；需要多实例部署时，应先把 datasource 切换到 PostgreSQL、重新生成 migration 并完成回归测试。

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

教师身份可通过 `/agent-orchestration` 接口创建、查询、调度、暂停、恢复和取消运行。运行快照持久化到 Prisma；API 重启时，未完成的 `running/paused` 任务会安全恢复为 `queued`，等待重新调度。默认 runner 不伪造执行结果，真正执行必须注入远程 Connector runner。

`apps/agent-connector` 已支持在受限工作区内启动 Codex、Claude 或显式白名单的自研 Provider，并提供超时、取消、输出上限、敏感信息脱敏及结构化事件上报。平台主动向 Connector 下发任务的传输层尚未接通，当前由 Connector CLI 在本机发起执行；具体参数见 `apps/agent-connector/README.md`。

学生在主城区点击“生成连接凭证”后，只需把页面给出的 `AGENT_GUILD_CONNECTION_CREDENTIAL='agc1....'` 命令提供给本机 Connector。凭证绑定学生、服务端地址和十分钟有效期，且只能兑换一次 Connector token；不包含用户登录密码。生产环境必须配置 `CONNECTOR_PUBLIC_API_URL` 和 `CONNECTOR_CREDENTIAL_SIGNING_SECRET`。

## Redis 评审队列

评审队列使用 Redis + BullMQ。未设置 `REDIS_URL` 时，API 会明确关闭 BullMQ worker，并对提交使用直接评审降级，不会反复连接本机 Redis。

```bash
export REDIS_URL="redis://localhost:6379"
pnpm dev:api
```

5. 分别启动 API 与 Web

```bash
pnpm dev:api
pnpm dev:web
```

默认地址：

- Web: `http://localhost:3000`
- API: `http://localhost:3001`

## 本机 Docker 部署

当前 Docker 方案固定使用以下结构：Web `3000`、API `3001`、容器内 Redis、SQLite 持久卷。SQLite 模式只允许一个 API 实例，不能横向扩容。

前置条件：

- Docker Engine
- Docker Compose v2 插件（命令必须能执行 `docker compose version`）

首次部署：

```bash
cp .env.docker.example .env.docker
```

编辑 `.env.docker`，至少替换下面两个占位值；真实密钥不得提交到仓库：

```bash
CONNECTOR_CREDENTIAL_SIGNING_SECRET=使用安全随机值
REGISTRATION_INTERNAL_CODE=使用私有注册码
```

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

停止服务但保留数据库和 Redis 数据：

```bash
docker compose --env-file .env.docker down
```

不要使用 `down -v`，否则会删除 SQLite 和 Redis 持久卷。生产环境还需要为 `api-data` 卷建立定期备份。

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
