# CLAUDE.md

本文件是 Claude Code 及其他编码 Agent 在本仓库的执行入口。完整产品原则、数据边界和开发协议见根目录 [`AGENTS.md`](./AGENTS.md)。

## 项目目标

这是一个教学场景的像素风 Web RPG Agent 世界：

- 学生通过 Day 任务学习构建、使用和协作 Agent。
- 教师通过课堂、任务、评审和学习洞察管理教学闭环。
- Agent 通过统一协议接入，可由平台 Agent 或学生本机 Connector 执行。
- Phaser 是世界表现层，API、数据库和教师裁定是业务真相。

## 开始任务

依次阅读：

1. `AGENTS.md`
2. `README.md`
3. `docs/architecture/功能图与技术栈.md`
4. 目标 workspace 的 `package.json`、相关模块和测试

然后执行：

```bash
git status --short
rg -n "目标功能|相关路由|相关类型" apps packages docs
```

不要回滚、覆盖或清理用户已有修改。发现与任务直接冲突的未提交修改时，先说明冲突文件。

## 仓库结构

| 目录 | 作用 |
|---|---|
| `apps/web` | Next.js、React、Phaser、学生端和教师端 |
| `apps/api` | NestJS REST、WebSocket、Prisma、队列和教学业务 |
| `apps/agent-connector` | 本机 Agent 配对、心跳、事件和受限命令执行 |
| `packages/contracts` | Zod 共享契约和推导 TypeScript 类型 |
| `docs` | PRD、功能图、技术说明和验收记录 |

## 不可违反的边界

### 业务真相

- 任务、评分、权限、课堂阶段、提交和解锁由 API/数据库决定。
- Phaser 只能把业务状态表现为地图、角色、家具、HUD 和动效。
- 页面不伪造后端没有提供的教学数据；后端不可达时显示明确安全降级状态。
- 教师/学生是主要真实账号；会长、成员、访客、协作者是关系身份。

### Agent 架构

- 内部统一使用 Agent session、task、capability、event、handoff 和 memory 语义。
- Codex、Claude Code、自研 Agent 通过 adapter 接入，不把厂商 SDK 写死进业务模块。
- 任务状态必须可追踪：`queued`、`running`、`paused`、`completed`、`failed`、`cancelled`。
- 默认最多两项并发任务；依赖、失败原因和 handoff 必须保留。
- 共享记忆必须带用户、课程、Agent session、任务或房间 scope，禁止跨学生泄漏。

### 本机执行安全

- API 不执行学生机器上的任意 shell；本机命令只能由 Connector 执行。
- 命令必须经过白名单、工作区根目录和参数校验；优先使用 `spawn(command, args)`。
- Connector 不保存或上报密钥；日志必须过滤 token、cookie、API key 和私钥。
- 删除、发布、推送、修改数据库和安装依赖属于高风险操作，必须显式确认或审批。

### Web 与 Phaser

- Next.js 页面优先保持 Server Component，客户端组件只承载交互写操作。
- Phaser 必须在浏览器生命周期内动态启动，不得让 SSR 或 jsdom 直接初始化引擎。
- 工位等场景遵循 `房间 < 桌后层 < 人物/椅子 < 桌前层 < 标签` 深度规则。
- 至少检查 `960x540` 设计比例和窄屏；HUD 不得遮挡主要人物和关键入口。

### 后端与契约

- 输入边界先校验，跨应用数据优先进入 `packages/contracts`。
- Controller 薄、Service 承载规则、Prisma 负责持久化、Gateway 只广播必要实时状态。
- 提交受理同步返回 submission、review snapshot 和 queue receipt；评审异步处理。
- 授权撤销使用软撤销并保留历史；列表接口返回可直接渲染的 read model。
- 当前用户以服务端 session 为准，不信任 body 中可篡改的 `studentId` 或角色字段。

## Agent 执行模板

### 开始

1. 复述目标、范围和不做事项。
2. 检查 git 状态、入口文件、共享契约和现有测试。
3. 拆成契约、后端、前端/世界、Connector、测试、文档六类。
4. 先写失败测试或契约，再写最小实现。

### Handoff

每个 Agent 必须交付：

```text
完成：
修改文件：
接口/类型变化：
验证命令与结果：
未解决问题：
下一步依赖：
```

## 验证命令

```bash
git diff --check

pnpm --filter contracts test
pnpm --filter contracts build

pnpm --filter web exec vitest run src/components/world
pnpm --filter api exec vitest run test/<target>.spec.ts
pnpm --filter agent-connector test

pnpm --filter api build
pnpm --filter web build
pnpm --filter agent-connector build

pnpm test
pnpm build
pnpm test:e2e
```

端口固定：Web `3000`、API `3001`、Playwright E2E Web `3100`。E2E 不复用开发 Web 端口。

## 失败处理

测试失败时不要直接修改断言或删除失败用例。先判断是代码错误、契约漂移、环境依赖、端口冲突还是历史基线问题，并标记是否由当前改动引入。

最终报告必须区分：

- 已通过
- 本次阻塞
- 历史失败

没有运行的命令不能声称通过。

## 交付报告

```text
方案：
修改：
验证：
风险：
下一步：
```

保持简洁，给出绝对文件路径；没有自然的下一步时不要强行添加建议。
