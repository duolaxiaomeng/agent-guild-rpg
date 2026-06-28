# Agent Guild RPG

面向教学场景的像素风 Web 端 RPG Agent 世界。

## 当前仓库包含什么

- `apps/web`: Next.js + Phaser 的世界壳与教学页面
- `apps/api`: NestJS API、提交流程与实时占位能力
- `packages/contracts`: 前后端共享的 Zod 契约

## 本地开发

1. 安装依赖

```bash
pnpm install
```

2. 安装 Playwright Chromium 浏览器

```bash
pnpm --filter web exec playwright install chromium
```

3. 可选：为后续 Prisma 和队列任务准备环境变量

```bash
export DATABASE_URL="postgresql://postgres:postgres@localhost:5432/agent_guild_rpg"
export REDIS_URL="redis://localhost:6379"
```

4. 可选：生成 Prisma client 并推送本地 schema

```bash
pnpm --filter api exec prisma generate
pnpm --filter api exec prisma db push
pnpm --filter api exec tsx prisma/seed.ts
```

## Redis 评审队列

评审队列使用 Redis + BullMQ。未设置 `REDIS_URL` 时，开发环境默认连接 `redis://127.0.0.1:6379`。

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

## 测试命令

- 工作区测试：`pnpm test`
- Web smoke test：`pnpm test:e2e`
- 工作区构建：`pnpm build`
- Playwright 会自动拉起独立的 Web 服务：`http://localhost:3100`，不占用本地开发 Web `3000`，也不影响 API `3001`

如果只想运行单个 smoke 用例，也可以执行：

```bash
pnpm --filter web exec playwright test tests/e2e/smoke.spec.ts
```
