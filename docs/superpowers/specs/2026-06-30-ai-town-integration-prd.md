# AI 小镇教学平台集成 PRD

## 1. 产品背景

### 1.1 项目现状

本平台是一款面向教学场景的像素风 Web 端 RPG Agent 世界。当前已建立的核心能力包括：

- 账号体系：老师 / 学生两类真实账号，世界身份（会长、成员、访客、互测者、协作者）作为关系态
- 课程关卡：Day1-Day10 独立课程关卡，由老师控制解锁
- Agent 提交：支持按钮触发、对话触发、定时触发三种入口，统一进入 `SubmissionService`
- 评审流水线：Agent 初评 + 老师最终裁定双轨制，基于 BullMQ 异步队列
- 工会系统：工会创建、加入、成员关系、任务板、协作点
- 聊天系统：个人聊天室、消息记录、房间授权访问
- 像素世界：基于 Kenney roguelike-rpg-pack 的 Phaser 场景，包含工作室大厅、工位区、协作室、评审区四个区域，区域内有 NPC（前台接待、管理员、评审员、项目经理、巡场同事等）和学生 Agent 虚拟形象
- 实时通道：基于 Socket.io 的 WebSocket 网关，广播 `presence:update` 事件

平台采用双层架构：下层 NestJS 后端维护业务真相（账号、课程、提交、评审、工会、授权），上层 Phaser 像素世界只负责可视化和游戏化表达。

### 1.2 AI 小镇概念

AI 小镇概念源自 Stanford Generative Agents 论文（Park et al., 2023）。核心思想是：AI Agent 在虚拟小镇中拥有记忆流（Memory Stream），能够自主地观察、反思和行动，产生涌现行为。

关键机制：

- **记忆流**：以时间序列记录 Agent 经历的所有观察，支持三维度检索（时近性、相关性、重要性）
- **反思**：当累计重要性超过阈值时，Agent 自动生成更高层级的洞察
- **计划**：基于记忆和反思，Agent 制定并执行日常计划
- **对话**：Agent 之间可基于共享上下文进行自然语言交互

### 1.3 结合动机

将 AI 小镇机制引入教学平台的核心动机：

1. **让学习行为可追溯**：通过记忆流记录学生每次提交、评审、协作事件，形成可检索的学习画像
2. **让 Agent 行为可观察**：学生 Agent 在像素世界有虚拟形象，状态实时同步，让"Agent 在做什么"变得可见
3. **让 NPC 变得智能**：像素世界 NPC 拥有人格和记忆，通过 LLM 生成有上下文的对话，增强沉浸感
4. **让学情洞察自动化**：基于反思机制自动生成学习洞察，辅助老师了解班级状态
5. **让协作教学成为可能**：多个教学 Agent 组成协作群，以 SOP 驱动完成评审、答疑、辅导等教学任务

设计原则：AI 小镇特性作为**增量增强**，不阻塞核心教学闭环。遵循平台既有的"能教 -> 能提 -> 能评 -> 能协作 -> 能沉浸 -> 能扩展"优先级。

## 2. 目标用户

### 2.1 学生

- 创建和管理自己的 AI Agent，观察其在像素世界中的自主行为
- 通过 Agent 虚拟形象直观了解自己 Agent 的在线状态、工作状态
- 与智能化 NPC 对话，获取有上下文的学习引导
- 查看个人学习洞察卡片，了解自己的学习路径建议

### 2.2 老师

- 通过 Agent 行为数据了解学生学习状态，获得班级学情洞察
- 利用教学 Agent 群辅助评审、答疑和辅导，降低运营负担
- 观察学生在像素世界中的协作行为，了解工会动态

### 2.3 平台运营

- 通过 AI 小镇机制增强教学沉浸感和参与度
- 利用 Agent 自主行为丰富世界表现，提升"活的世界"体验
- 积累教学行为数据，优化课程设计和关卡难度

## 3. 核心功能需求

### 3.1 学习记忆流（P0）

#### 功能描述

为每个学生建立学习记忆流，记录其在教学平台上的所有关键事件：提交、评审、协作、授权、工会活动等。记忆流支持三维度检索和反思机制，为后续自适应学习路径和学情洞察提供数据基础。

#### 记忆事件类型

| 事件类型 | 触发时机 | 示例内容 |
|---------|---------|---------|
| `submission` | 学生提交时 | "学生在 Day3 提交了 Agent 会话，工作摘要：实现了用户认证模块" |
| `review` | 评审结果产生时 | "Agent 初评建议分 85，老师裁定为 80，理由：产出完整但反思不够" |
| `collaboration` | 协作贡献记录时 | "为同学 Alice 的聊天室提供了调试建议，获得 3 协作点" |
| `guild` | 工会活动时 | "工会 'Alpha' 完成了跨工会互测任务" |
| `quest` | 关卡状态变化时 | "Day5 关卡解锁" |
| `reflection` | 反思生成时 | "学生近期在认证模块表现稳定，建议进入系统设计关卡" |

#### 三维度检索

检索函数对每条记忆计算综合得分：

```
score(memory, query) = α × recency(memory) + β × relevance(memory, query) + γ × importance(memory)
```

默认权重：

- 时近性 `α = 0.5`：基于 `lastAccessedAt` 的指数衰减
- 相关性 `β = 3.0`：基于查询与记忆内容的语义相似度（向量余弦相似度）
- 重要性 `γ = 2.0`：1-10 的整数分，由系统根据事件类型预设或由 LLM 打分

#### 反思机制

当学生记忆流中最近 N 条记忆的累计重要性超过阈值（默认 150）时，自动触发反思：

1. 检索近期高重要性记忆
2. 调用 LLM 生成学习洞察（如"该学生在认证模块表现稳定，建议进入系统设计关卡"）
3. 将洞察作为新的 `reflection` 类型记忆写入记忆流
4. 洞察同时推送至学生主页和老师工作台

#### 数据模型

```prisma
model AgentMemory {
  id               String   @id @default(uuid())
  studentId        String
  type             MemoryType
  content          String
  embedding        Json?
  importance       Int      @default(1)
  createdAt        DateTime @default(now())
  lastAccessedAt   DateTime @default(now())
  reflectionOf     String?

  @@index([studentId, createdAt])
  @@index([studentId, type])
}

enum MemoryType {
  submission
  review
  collaboration
  guild
  quest
  reflection
  observation
}
```

#### 验收标准

- [ ] `AgentMemory` 模型在 Prisma schema 中定义，`prisma generate` 通过
- [ ] `MemoryService.observe()` 可记录提交、评审、协作、工会、关卡事件
- [ ] `MemoryService.retrieve()` 返回按三维度综合得分排序的记忆列表
- [ ] 时近性得分基于 `lastAccessedAt` 指数衰减，检索后更新 `lastAccessedAt`
- [ ] 相关性得分基于向量余弦相似度计算
- [ ] 重要性得分支持系统预设（按事件类型）和 LLM 打分两种模式
- [ ] `MemoryService.reflect()` 在累计重要性超阈值时生成学习洞察并写入记忆流
- [ ] 集成测试覆盖 observe -> retrieve -> reflect 完整流程
- [ ] 提交流程（`POST /submissions`）成功后自动调用 `MemoryService.observe()` 记录事件
- [ ] 评审流程（`POST /reviews/decide`）成功后自动调用 `MemoryService.observe()` 记录事件

### 3.2 NPC 智能化（P1）

#### 功能描述

像素世界中的 NPC 拥有独立的记忆流和人格设定，通过 LLM API 生成有上下文的对话。NPC 对话以气泡/弹窗形式在 Phaser 场景中展示。

#### 现有 NPC 改造清单

| NPC ID | 名称 | 所在区域 | 人格设定 |
|--------|------|---------|---------|
| `receptionist` | 前台接待 | 工作室大厅 | 热情引导者，负责介绍工作室功能和当日公告 |
| `manager` | 管理员 | 工作室大厅 | 全局协调者，了解班级整体进度和任务分配 |
| `reviewer` | 评审员 | 评审区 | 严谨的代码审查者，能提供具体的改进建议 |
| `pm` | 项目经理 | 协作室 | 敏捷推进者，关注任务进度和团队协作 |
| `walker-a` | 巡场同事 | 工位区 | 友善的同事，分享实用技巧和经验 |
| `qa` | 质检员 | 评审区 | 注重质量的测试专家，关注边界情况和测试覆盖 |

#### NPC 人格模型

```prisma
model NPCAgent {
  id            String   @id @default(uuid())
  npcId         String   @unique
  name          String
  personality   String
  systemPrompt  String
  memoryId      String?

  memories      AgentMemory[]
  conversations NPCConversation[]

  @@index([npcId])
}

model NPCConversation {
  id           String   @id @default(uuid())
  npcAgentId   String
  studentId    String?
  messages     Json
  createdAt    DateTime @default(now())

  npcAgent     NPCAgent @relation(fields: [npcAgentId], references: [id])
}
```

#### LLM 适配器

采用平台既有的"统一内部抽象 + 外部适配器"架构原则，LLM 后端使用火山引擎豆包 API（方舟平台 Ark），通过 OpenAI SDK 兼容接口接入：

```typescript
interface LLMAdapter {
  name: string;
  chat(messages: ChatMessage[], options?: ChatOptions): Promise<string>;
}

// 内置适配器：火山引擎豆包 API（Ark）
class ArkAdapter implements LLMAdapter {
  private client: OpenAI;

  constructor() {
    this.client = new OpenAI({
      baseURL: process.env.ARK_BASE_URL ?? "https://ark.cn-beijing.volces.com/api/v3",
      apiKey: process.env.ARK_API_KEY!,
    });
  }

  async chat(messages: ChatMessage[], options?: ChatOptions): Promise<string> {
    // 文本对话
    const response = await this.client.chat.completions.create({
      model: process.env.ARK_MODEL ?? "84bedb86-9ff8-478a-afa7-b0945be51116",
      messages,
      ...options,
    });
    return response.choices[0]?.message?.content ?? "";
  }
}
```

适配器同时支持多模态（图片 + 文本）输入，用于 NPC 视觉感知、Agent 截图分析等场景：

```typescript
// 多模态（图片+文本）
const multimodalResponse = await client.chat.completions.create({
  model: "84bedb86-9ff8-478a-afa7-b0945be51116",
  messages: [
    {
      role: "user",
      content: [
        { type: "image_url", image_url: { url: "https://example.com/image.png" } },
        { type: "text", text: "描述这张图片" },
      ],
    }
  ],
});
```

火山引擎豆包 API 通过环境变量配置：

```
ARK_API_KEY=<火山引擎方舟平台 API Key>
ARK_BASE_URL=https://ark.cn-beijing.volces.com/api/v3
ARK_MODEL=84bedb86-9ff8-478a-afa7-b0945be51116
```

#### 对话流程

1. 学生在 Phaser 场景中点击 NPC
2. 前端调用 `GET /npc/:npcId/conversation?studentId=...`
3. 后端检索 NPC 记忆流 + 学生上下文（可选）
4. 组装 systemPrompt + 记忆上下文 + 学生信息，调用 LLM
5. 返回对话文本，前端在 Phaser 场景中展示气泡/弹窗
6. 对话记录存入 `NPCConversation`

#### 验收标准

- [ ] `NPCAgent` 和 `NPCConversation` 模型在 Prisma schema 中定义
- [ ] `NPCAgentService` 实现 NPC 对话生成
- [ ] LLM 适配器通过 OpenAI SDK 兼容接口接入火山引擎豆包 API（Ark）
- [ ] 适配器 baseURL 配置为 `https://ark.cn-beijing.volces.com/api/v3`
- [ ] 适配器 model 使用 endpoint ID `84bedb86-9ff8-478a-afa7-b0945be51116`
- [ ] 适配器支持文本对话和多模态（图片 + 文本）输入
- [ ] LLM 配置通过环境变量（`ARK_API_KEY`、`ARK_BASE_URL`、`ARK_MODEL`）读取，无需改代码
- [ ] NPC 拥有独立记忆流，对话时可检索相关记忆作为上下文
- [ ] Phaser 场景中 NPC 对话以气泡/弹窗形式展示
- [ ] 至少 2 个 NPC（前台接待、评审员）完成智能化改造
- [ ] NPC 对话记录持久化到 `NPCConversation`
- [ ] LLM 调用通过 BullMQ 异步化，不阻塞主流程（首次对话可同步等待，超时降级为预设回复）

### 3.3 学生 Agent 虚拟形象（P1）

#### 功能描述

学生 Agent 在像素世界有对应的虚拟形象，根据真实会话状态更新行为模式。虚拟形象复用现有 WebSocket 实时通道和 Phaser 场景渲染能力。

#### 状态映射

| AgentSession 状态 | 虚拟形象行为 | 显示图标 |
|-------------------|-------------|---------|
| `active` | 在工位区就坐，头顶显示"工作中" | search |
| `completed` | 站起走动，头顶显示"已完成" | ok |
| `failed` | 原地停留，头顶显示"异常" | warning |
| 离线 | 不在场景中显示 | - |
| 待命（无活跃会话） | 在大厅走动，头顶显示"待命" | notify |

#### 数据模型

```prisma
model AgentVirtualAvatar {
  id            String   @id @default(uuid())
  studentId     String   @unique
  displayName   String
  shirtColor    String   @default("#3b82f6")
  hairColor     String   @default("#92400e")
  zoneId        String   @default("lobby")
  positionX     Int      @default(480)
  positionY     Int      @default(300)
  state         String   @default("idle")
  lastSeenAt    DateTime @default(now())

  @@index([studentId])
}
```

#### 实时同步

复用现有 `RealtimeGateway` 的 WebSocket 通道，新增事件类型：

- `agent:state-update` — Agent 状态变化（在线/离线/工作中/已完成/异常）
- `agent:position-update` — Agent 位置变化（自主移动时）

前端 `WorldShell` 监听这些事件，更新 Phaser 场景中的虚拟形象。

#### 验收标准

- [ ] `AgentVirtualAvatar` 模型在 Prisma schema 中定义
- [ ] 学生首次创建 AgentSession 时自动初始化虚拟形象
- [ ] AgentSession 状态变化时虚拟形象行为同步更新
- [ ] 虚拟形象状态通过 WebSocket 实时广播
- [ ] Phaser 场景渲染学生 Agent 虚拟形象，支持自主移动
- [ ] Agent 虚拟形象可展示对话气泡
- [ ] 离线 Agent 不在场景中显示

### 3.4 自适应学习路径（P2）

#### 功能描述

基于记忆流检索和反思结果，为学生推荐下一关，为老师提供班级学情洞察。参考 Voyager 自动课程机制，将学习路径推荐从"线性解锁"升级为"自适应推荐"。

#### 学生侧

- **学习洞察卡片**：在学生主页展示，基于反思生成，内容如"你在认证模块表现稳定，建议挑战 Day6 系统设计关卡"
- **下一关推荐**：基于记忆流检索，推荐与当前能力最匹配的关卡

#### 老师侧

- **班级学情面板**：在老师工作台展示，聚合全班学生的记忆流和反思
  - 班级整体进度热力图
  - 需要关注的学生列表（低分、连续未提交、卡关）
  - 推荐的班级级教学调整建议

#### API 设计

```
GET /learning-insights/:studentId — 获取学生个人学习洞察
GET /learning-insights/class/:courseWorldId — 获取班级学情概览（老师权限）
```

#### 验收标准

- [ ] 反思生成的学习洞察在学生主页可见
- [ ] 老师工作台展示班级学情面板
- [ ] 需要关注的学生列表基于记忆流数据自动生成
- [ ] 下一关推荐基于记忆流三维度检索结果
- [ ] 学情洞察不影响课程解锁权限（解锁仍由老师控制）

### 3.5 多 Agent 协作教学（P2）

#### 功能描述

构建教学 Agent 群，由助教 Agent、评审 Agent、答疑 Agent 组成，以 SOP 驱动完成教学任务。参考 AutoGen 多 Agent 对话模式和 MetaGPT SOP 驱动结构化输出。

#### 教学 Agent 群

| Agent 角色 | 职责 | 触发场景 |
|-----------|------|---------|
| 助教 Agent | 辅导学生，提供学习建议和路径推荐 | 学生请求帮助时 |
| 评审 Agent | 辅助老师评审，生成评分建议和风险标签 | 提交进入队列时 |
| 答疑 Agent | 回答学生关于关卡内容的技术问题 | 学生在聊天室提问时 |

#### SOP 驱动流程

以评审 SOP 为例：

```
1. [评审 Agent] 接收提交，检索相关记忆和标准
2. [评审 Agent] 生成评分建议、理由和风险标签
3. [助教 Agent] 基于评审结果生成学习建议
4. [答疑 Agent] 准备常见问题解答（如有）
5. 汇总输出到老师工作台和学生主页
```

#### 工会协作演示

在工会大厅场景中，演示多个 Agent 之间的协作过程：

- Agent A 提出方案
- Agent B 进行评审
- Agent C 补充测试建议
- 过程在 Phaser 场景中以对话气泡形式展示

#### 验收标准

- [ ] 教学 Agent 群框架可定义 Agent 角色和 SOP 流程
- [ ] 至少 1 个 SOP 流程（评审 SOP）可端到端运行
- [ ] SOP 输出结果汇入老师工作台
- [ ] 工会场景可演示 Agent 间协作对话
- [ ] 多 Agent 对话过程有结构化记录，可追溯

## 4. 技术架构

### 4.1 整体架构

遵循平台双层架构原则，AI 小镇特性在两层中各有职责：

```
┌─────────────────────────────────────────────────────────┐
│                   像素世界表现层（上层）                    │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐              │
│  │ NPC 对话  │  │ Agent    │  │ 学习洞察   │              │
│  │ 气泡渲染  │  │ 虚拟形象  │  │ 卡片渲染   │              │
│  └─────┬────┘  └─────┬────┘  └─────┬────┘              │
│        └──────────────┼──────────────┘                   │
│                 WorldShell + Phaser                      │
└────────────────────────┬────────────────────────────────┘
                         │ WebSocket / HTTP
┌────────────────────────┴────────────────────────────────┐
│                 业务真相层（下层 NestJS）                 │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐              │
│  │ Memory   │  │ NPC      │  │ Avatar   │              │
│  │ Service  │  │ Service  │  │ Service  │              │
│  └─────┬────┘  └─────┬────┘  └─────┬────┘              │
│        └──────────────┼──────────────┘                   │
│                 LLM Adapter Layer                        │
│           ┌──────────┴──────────┐                       │
│           │                     │                       │
│      Ark Adapter (火山引擎豆包)   OpenAI SDK 兼容          │
└─────────────────────────────────────────────────────────┘
                         │
┌────────────────────────┴────────────────────────────────┐
│                    数据与基础设施层                       │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐              │
│  │ Prisma   │  │ Redis    │  │ BullMQ   │              │
│  │ +pgvector│  │ (实时)    │  │ (异步队列) │              │
│  └──────────┘  └──────────┘  └──────────┘              │
└─────────────────────────────────────────────────────────┘
```

### 4.2 数据模型扩展

在现有 Prisma schema 基础上新增以下模型：

#### AgentMemory

```prisma
enum MemoryType {
  submission
  review
  collaboration
  guild
  quest
  reflection
  observation
}

model AgentMemory {
  id               String     @id @default(uuid())
  studentId       String
  type             MemoryType
  content         String
  embedding       Json?
  importance       Int        @default(1)
  createdAt        DateTime   @default(now())
  lastAccessedAt   DateTime   @default(now())
  reflectionOf     String?

  @@index([studentId, createdAt])
  @@index([studentId, type])
}
```

#### NPCAgent

```prisma
model NPCAgent {
  id            String            @id @default(uuid())
  npcId         String            @unique
  name          String
  personality   String
  systemPrompt  String
  memories      AgentMemory[]
  conversations NPCConversation[]
}
```

#### NPCConversation

```prisma
model NPCConversation {
  id           String    @id @default(uuid())
  npcAgentId   String
  studentId    String?
  messages     Json
  createdAt    DateTime  @default(now())

  npcAgent     NPCAgent  @relation(fields: [npcAgentId], references: [id])
}
```

#### AgentVirtualAvatar

```prisma
model AgentVirtualAvatar {
  id            String   @id @default(uuid())
  studentId     String   @unique
  displayName   String
  shirtColor    String   @default("#3b82f6")
  hairColor     String   @default("#92400e")
  zoneId        String   @default("lobby")
  positionX     Int      @default(480)
  positionY     Int      @default(300)
  state         String   @default("idle")
  lastSeenAt    DateTime @default(now())
}
```

### 4.3 LLM 后端配置

平台 LLM 推理统一使用火山引擎豆包 API（方舟平台 Ark），通过 OpenAI SDK 兼容接口接入。火山引擎方舟平台提供高性能推理服务，支持文本对话和多模态输入。

**火山引擎豆包 API 配置**：

| 配置项 | 值 | 说明 |
|-------|-----|------|
| Base URL | `https://ark.cn-beijing.volces.com/api/v3` | 方舟平台 API 入口 |
| Model / Endpoint ID | `84bedb86-9ff8-478a-afa7-b0945be51116` | 豆包大模型推理接入点 ID |
| SDK | OpenAI SDK 兼容接口 | 使用 `openai` npm 包，仅需配置 baseURL 和 apiKey |
| 鉴权方式 | Bearer Token | 请求头 `Authorization: Bearer <ARK_API_KEY>` |
| 地域 | cn-beijing | 方舟平台北京地域 |

**环境变量**：

| 环境变量 | 说明 | 默认值 |
|---------|------|--------|
| `ARK_API_KEY` | 火山引擎方舟平台 API Key，必填 | 无（需在方舟控制台获取） |
| `ARK_BASE_URL` | 方舟平台 API 入口地址 | `https://ark.cn-beijing.volces.com/api/v3` |
| `ARK_MODEL` | 豆包模型 / Endpoint ID | `84bedb86-9ff8-478a-afa7-b0945be51116` |

> **注意**：`ARK_API_KEY` 为敏感信息，不可提交到仓库，应通过 `.env` 文件或环境变量注入。`.env` 文件已在 `.gitignore` 中忽略。

### 4.4 向量检索方案

当前数据库使用 SQLite，向量检索（pgvector）需要 PostgreSQL。采用渐进式策略：

- **阶段一（V1.5）**：使用 SQLite 存储记忆，相关性检索使用 TF-IDF 或简单关键词匹配。`embedding` 字段存储为 JSON 数组，但检索不依赖向量数据库。
- **阶段二（V2）**：迁移至 PostgreSQL + pgvector，启用真正的向量余弦相似度检索。`embedding` 字段类型从 `Json?` 迁移为 pgvector 的 `vector` 类型。

这样能在不阻塞 V1.5 交付的前提下，先让记忆流底座跑起来，再在 V2 切换到更强的检索能力。

### 4.5 LLM 调用异步化

遵循平台"提交受理同步确认，评审处理异步排队"的原则，LLM 调用同样异步化：

- **同步场景**：NPC 对话首次请求（可设置超时降级为预设回复）
- **异步场景**：反思生成、学情洞察生成、多 Agent SOP 流程

异步场景通过现有 BullMQ 队列处理，新增队列：

- `memory-reflection-queue` — 反思任务
- `npc-conversation-queue` — NPC 对话生成（非首次）
- `teaching-sop-queue` — 教学 SOP 流程

### 4.6 API 设计

#### 记忆流 API

```
POST /agent-memory/observe
  Body: { studentId, type, content, importance? }
  Response: { id, studentId, type, content, importance, createdAt }

GET /agent-memory/retrieve?studentId=...&query=...&limit=10
  Response: { memories: [{ id, type, content, importance, score, createdAt }] }

POST /agent-memory/reflect
  Body: { studentId }
  Response: { reflection: { id, content, insights: string[] } }
```

#### NPC 对话 API

```
GET /npc/:npcId/conversation?studentId=...&message=...
  Response: { reply: string, conversationId: string }

POST /npc/:npcId/conversation
  Body: { studentId, message }
  Response: { reply: string, conversationId: string }
```

#### Agent 虚拟形象 API

```
GET /agent-avatar/:studentId
  Response: { id, displayName, shirtColor, hairColor, zoneId, positionX, positionY, state }

PATCH /agent-avatar/:studentId
  Body: { zoneId?, positionX?, positionY?, state? }
  Response: { id, ...updatedFields }
```

#### 学习洞察 API

```
GET /learning-insights/:studentId
  Response: { insights: [{ type, content, createdAt }], recommendations: [{ dayId, reason }] }

GET /learning-insights/class/:courseWorldId
  Response: { summary: { totalStudents, avgProgress, attentionNeeded }, students: [...] }
```

### 4.7 共享契约

遵循"共享契约先行法"，新增的 API 契约在 `packages/contracts` 中定义 Zod schema：

- `agent-memory.ts` — 记忆流 observe/retrieve/reflect 契约
- `npc.ts` — NPC 对话契约
- `agent-avatar.ts` — Agent 虚拟形象契约
- `learning-insights.ts` — 学习洞察契约

先定义 Zod schema，再反推 TypeScript 类型，确保前后端共用同一份契约。

### 4.8 前端集成

遵循"Phaser 只做客户端世界壳，SSR 与测试环境不直连引擎"原则：

- `WorldShell` 保持薄壳，负责挂载点和生命周期
- NPC 对话气泡在 Phaser 场景中渲染，但对话数据通过 API client 获取
- Agent 虚拟形象状态通过 WebSocket 事件更新，不由 Phaser 自行管理
- 学习洞察卡片作为独立 React 组件，在 Next.js 页面层渲染
- 测试环境显式跳过 Phaser 启动，只验证 API client 行为和页面标题

## 5. 实现路线图

### 阶段一：记忆流底座（V1.5）

**目标**：建立学习记忆流数据底座，接入现有提交流和评审流程。

**交付物**：

1. Prisma schema 新增 `AgentMemory` 模型和 `MemoryType` 枚举
2. NestJS 新增 `MemoryModule`，包含 `MemoryService`（observe / retrieve / reflect）
3. `packages/contracts` 新增 `agent-memory.ts` 共享契约
4. 提交流程（`SubmissionsController`）中接入 `MemoryService.observe()`
5. 评审流程（`ReviewsController`）中接入 `MemoryService.observe()`
6. 三维度检索实现（V1.5 使用 TF-IDF 相关性，不依赖 pgvector）
7. 反思机制实现（累计重要性超阈值触发 LLM 生成洞察）
8. 集成测试覆盖 observe -> retrieve -> reflect 完整流程

**验证命令**：

```bash
pnpm --filter api exec vitest run test/agent-memory.spec.ts
pnpm --filter api exec vitest run test/submission-flow.spec.ts
pnpm --filter api build
pnpm --filter contracts build && pnpm --filter contracts test
```

### 阶段二：NPC 智能化（V2）

**目标**：像素世界 NPC 拥有人格和记忆，通过 LLM 生成有上下文的对话。

**交付物**：

1. Prisma schema 新增 `NPCAgent` 和 `NPCConversation` 模型
2. NestJS 新增 `NPCModule`，包含 `NPCAgentService`
3. LLM 适配器层实现（火山引擎豆包 API，基于 OpenAI SDK 兼容接口）
4. LLM 调用通过环境变量配置（`ARK_API_KEY`、`ARK_BASE_URL`、`ARK_MODEL`）
5. 适配器支持多模态（图片 + 文本）输入
5. Phaser 场景中 NPC 对话气泡组件
6. 现有 NPC 逐一改造（优先：前台接待、评审员）
7. NPC 对话记录持久化
8. LLM 调用异步化（BullMQ 队列）

**验证命令**：

```bash
pnpm --filter api exec vitest run test/npc-conversation.spec.ts
pnpm --filter web exec vitest run src/components/world/npc-dialog.test.tsx
pnpm --filter web build
```

### 阶段三：学生 Agent 虚拟形象（V2）

**目标**：学生 Agent 在像素世界有虚拟形象，状态实时同步。

**交付物**：

1. Prisma schema 新增 `AgentVirtualAvatar` 模型
2. NestJS 新增 `AvatarModule`，包含 `AvatarService`
3. `RealtimeGateway` 新增 `agent:state-update` 和 `agent:position-update` 事件
4. AgentSession 状态变化时自动更新虚拟形象状态
5. Phaser 场景渲染虚拟形象，支持自主移动
6. 虚拟形象对话气泡展示
7. 前端 `WorldShell` 监听 WebSocket 事件更新虚拟形象

**验证命令**：

```bash
pnpm --filter api exec vitest run test/agent-avatar.spec.ts
pnpm --filter api exec vitest run test/realtime.spec.ts
pnpm --filter web build
```

### 阶段四：自适应学习路径（V2.5）

**目标**：基于记忆流生成学习洞察，辅助学生和老师。

**交付物**：

1. 反思生成的学习洞察在学生主页展示
2. 老师工作台新增班级学情面板
3. 下一关推荐算法实现
4. `packages/contracts` 新增 `learning-insights.ts` 共享契约
5. 页面层并发请求记忆和洞察数据

**验证命令**：

```bash
pnpm --filter api exec vitest run test/learning-insights.spec.ts
pnpm --filter web build
pnpm test:e2e
```

### 阶段五：多 Agent 协作教学（V3）

**目标**：教学 Agent 群以 SOP 驱动完成教学任务。

**交付物**：

1. 教学 Agent 群框架（角色定义 + SOP 流程定义）
2. 评审 SOP 端到端运行
3. 工会场景 Agent 间协作演示
4. 多 Agent 对话结构化记录
5. `packages/contracts` 新增 `teaching-sop.ts` 共享契约

**验证命令**：

```bash
pnpm --filter api exec vitest run test/teaching-sop.spec.ts
pnpm --filter api build
pnpm test:e2e
```

## 6. 验收标准

### 6.1 阶段一验收（记忆流底座）

- [ ] `AgentMemory` 模型在 Prisma schema 中定义，`prisma generate` 通过
- [ ] `MemoryType` 枚举包含 submission、review、collaboration、guild、quest、reflection
- [ ] `MemoryService.observe()` 可记录提交、评审、协作、工会、关卡事件
- [ ] `MemoryService.retrieve()` 返回三维度排序的记忆列表
- [ ] 时近性得分基于 `lastAccessedAt` 指数衰减
- [ ] 相关性得分 V1.5 使用 TF-IDF，V2 升级为向量余弦相似度
- [ ] 重要性得分支持系统预设（按事件类型）
- [ ] `MemoryService.reflect()` 在累计重要性超阈值时生成学习洞察
- [ ] 集成测试覆盖记忆流完整流程（observe -> retrieve -> reflect）
- [ ] 提交流程成功后自动记录 `submission` 类型记忆
- [ ] 评审流程成功后自动记录 `review` 类型记忆
- [ ] 共享契约 `agent-memory.ts` 定义且前后端共用
- [ ] `pnpm --filter api build` 通过
- [ ] `pnpm --filter contracts build && pnpm --filter contracts test` 通过

### 6.2 阶段二验收（NPC 智能化）

- [ ] `NPCAgent` 和 `NPCConversation` 模型在 Prisma schema 中定义
- [ ] NPC 拥有独立记忆流（复用 `AgentMemory`，`studentId` 字段存 NPC ID）
- [ ] NPC 对话通过火山引擎豆包 API 生成（OpenAI SDK 兼容接口）
- [ ] LLM 配置通过环境变量（`ARK_API_KEY`、`ARK_BASE_URL`、`ARK_MODEL`）读取，无需改代码
- [ ] 适配器支持文本对话和多模态输入
- [ ] Phaser 场景展示 NPC 对话气泡
- [ ] 至少 2 个 NPC（前台接待、评审员）完成智能化改造
- [ ] NPC 对话记录持久化到 `NPCConversation`
- [ ] LLM 调用通过 BullMQ 异步化，不阻塞主流程
- [ ] LLM 超时降级为预设回复
- [ ] `pnpm --filter web build` 通过

### 6.3 阶段三验收（Agent 虚拟形象）

- [ ] `AgentVirtualAvatar` 模型在 Prisma schema 中定义
- [ ] 学生 Agent 在像素世界有虚拟形象
- [ ] Agent 状态实时同步（在线/工作中/已完成/异常/待命）
- [ ] 虚拟形象状态通过 WebSocket 广播
- [ ] Phaser 场景渲染虚拟形象，支持自主移动
- [ ] Agent 虚拟形象可展示对话气泡
- [ ] 离线 Agent 不在场景中显示
- [ ] `pnpm --filter web build` 通过

### 6.4 阶段四验收（自适应学习路径）

- [ ] 反思生成的学习洞察在学生主页可见
- [ ] 老师工作台展示班级学情面板
- [ ] 需要关注的学生列表基于记忆流数据自动生成
- [ ] 下一关推荐基于记忆流检索结果
- [ ] 学情洞察不影响课程解锁权限
- [ ] `pnpm test:e2e` 通过

### 6.5 阶段五验收（多 Agent 协作教学）

- [ ] 教学 Agent 群框架可定义角色和 SOP 流程
- [ ] 至少 1 个 SOP 流程（评审 SOP）端到端运行
- [ ] SOP 输出结果汇入老师工作台
- [ ] 工会场景可演示 Agent 间协作对话
- [ ] 多 Agent 对话过程有结构化记录

## 7. 风险与约束

### 7.1 成本控制

- 低价值事件（如普通聊天消息）不调用 LLM 打分，使用系统预设重要性
- 反思频率可控（默认每 50 条记忆触发一次，或累计重要性超阈值触发）
- NPC 对话缓存：相同 NPC 相同上下文的对话在短时间内复用缓存
- LLM 调用使用火山引擎豆包 API，按 token 计费，通过控制调用频率和上下文长度控制成本
- 豆包 API 计费方式：按输入 token 数和输出 token 数分别计费（输入 token 价格低于输出 token），可通过方舟控制台监控用量
- 建议为反思、学情洞察等异步任务设置 token 上限（如 max_tokens: 500），避免单次调用成本过高

### 7.2 教学可控性

- Agent 自主行为限制在教学相关范围内
- NPC 对话不涉及评分、解锁等业务真相，只提供引导和建议
- 学情洞察为辅助参考，不替代老师判断
- 课程解锁权限始终由老师控制，Agent 推荐不自动解锁

### 7.3 隐私保护

- 区分学生可见记忆和系统内部记忆
- 学生可查看自己的记忆流和洞察，但不可见其他学生的
- 老师可查看班级学情概览，但个人记忆明细需学生授权
- NPC 记忆与学生记忆隔离存储

### 7.4 延迟处理

- LLM 调用异步化，不阻塞主流程
- NPC 对话首次请求可同步等待（超时 5 秒降级为预设回复）
- 反思和学情洞察通过 BullMQ 异步处理
- 记忆流写入不阻塞提交响应（`queueMicrotask` 或队列异步执行）

### 7.5 不过度工程化

- AI 小镇特性作为增量增强，不阻塞核心教学闭环
- 遵循"先教学闭环，后世界增强"优先级
- V1.5 不依赖 pgvector，先用 TF-IDF 跑通记忆流底座
- 多 Agent 协作教学延后到 V3，不提前引入复杂度
- 每个 API 都有明确的最小实现，不为未来不确定需求过度设计

### 7.6 数据库迁移风险

- 当前使用 SQLite，V2 迁移至 PostgreSQL + pgvector 需要数据迁移
- 迁移期间保持双写兼容，确保回滚安全
- `embedding` 字段在 V1.5 使用 `Json?` 类型，V2 迁移为 pgvector `vector` 类型

## 8. 参考资料

- Generative Agents: Interactive Simulacra of Human Behavior (Park et al., 2023): https://arxiv.org/abs/2304.03442
- Voyager: An Open-Ended Embodied Agent with Large Language Models (Wang et al., 2023): https://arxiv.org/abs/2305.16291
- AutoGen: Enabling Next-Gen LLM Applications via Multi-Agent Conversation (Wu et al., 2023): https://arxiv.org/abs/2308.08155
- MetaGPT: Meta Programming for Multi-Agent Collaborative Framework (Hong et al., ICLR 2024): https://arxiv.org/abs/2308.00352
- AI Town (a16z): https://github.com/a16z-infra/ai-town
- Stanford Generative Agents (official implementation): https://github.com/joonspk-research/generative_agents
- 火山引擎方舟平台（Ark）文档：https://www.volcengine.com/docs/82379
- 火山引擎豆包大模型：https://www.volcengine.com/product/doubao
- OpenAI Node SDK（豆包 API 兼容）：https://github.com/openai/openai-node
