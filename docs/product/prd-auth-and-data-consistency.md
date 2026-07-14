# PRD: 认证 Token 传递与数据一致性修复

> **文档版本**: v1.0  
> **日期**: 2026-07-08  
> **作者**: 产品官  
> **状态**: 待评审

---

## 目录

1. [背景与目标](#1-背景与目标)
2. [问题组 A — SSR 层未传递认证 Token (Critical #1, #2, #8)](#2-问题组-a--ssr-层未传递认证-token-critical-1-2-8)
3. [问题组 B — 种子数据 roomId 格式不匹配 (Critical #3, #4)](#3-问题组-b--种子数据-roomid-格式不匹配-critical-3-4)
4. [问题组 C — 客户端未传递 Token (High #5, #6)](#4-问题组-c--客户端未传递-token-high-5-6)
5. [问题组 D — 中间件不验证 Token 有效性 (High #7)](#5-问题组-d--中间件不验证-token-有效性-high-7)
6. [问题组 E — API 宕机时 SSR 误判 (Medium #9)](#6-问题组-e--api-宕机时-ssr-误判-medium-9)
7. [问题组 F — 不存在资源返回 500 (Medium #10, #11)](#7-问题组-f--不存在资源返回-500-medium-10-11)
8. [实施优先级与依赖关系](#8-实施优先级与依赖关系)
9. [附录：技术参考](#9-附录技术参考)

---

## 1. 背景与目标

### 1.1 项目现状

Agent Guild RPG 是一个基于 Next.js 15 (前端) + NestJS 11 (后端 API) 的全栈教育游戏化平台，采用 pnpm Monorepo 架构。认证流程如下：

1. 用户登录 → API 返回 `AuthSession { token, user }`
2. 前端将 token 同时写入 `localStorage`（客户端使用）和 Cookie `agent-guild-session-token`（中间件/SSR 使用）
3. API 端所有 Controller 均挂载 `@UseGuards(AuthGuard)`，要求 `Authorization: Bearer <token>` 头
4. WebSocket 网关 `handleConnection` 检查 `client.handshake.auth?.token` 或 `client.handshake.query?.token`

### 1.2 核心问题

审查发现：**所有 API 端 Controller（World、Guilds、AgentAvatars、Reviews、Rooms）均挂载了 `@UseGuards(AuthGuard)`，要求 Bearer Token**。但前端 SSR 和部分客户端代码未传递 Token，导致：

- 主页、公会页 SSR 数据永远降级（API 返回 401 → 降级为空态）
- 客户端 Agent 头像获取失败
- WebSocket 连接被服务端拒绝
- 种子数据 roomId 格式与业务逻辑不匹配，导致房间授权和聊天功能完全失效

### 1.3 目标

| 目标 | 衡量标准 |
|------|---------|
| SSR 页面正确传递认证 Token | 主页/公会页 SSR 数据加载成功，不显示降级提示 |
| 种子数据 roomId 与代码约定一致 | `GET /rooms/accessible-rooms` 返回 200 且包含有效数据 |
| 客户端 REST 和 WebSocket 请求携带 Token | Agent 头像正常渲染，WebSocket 实时更新生效 |
| 中间件验证 Token 有效性 | 无效/过期 Token 被重定向至登录页 |
| API 对不存在资源返回 404 而非 500 | `POST /reviews/decide` 和 `POST /rooms/access-grants/:id/revoke` 对不存在 ID 返回 404 |

---

## 2. 问题组 A — SSR 层未传递认证 Token (Critical #1, #2, #8)

### 2.1 问题概述

主页和公会页的 Server Component 在调用 API 时未携带认证 Token，而所有 API 端点均要求 Bearer Token 认证，导致 SSR 数据获取永远返回 401 并降级为空态。

### 2.2 证据

**主页 `apps/web/src/app/page.tsx`（第 9 行）**：
```typescript
const { degraded } = await getWorldPayloadSafe();
// getWorldPayloadSafe() 不接收 token 参数，内部调用 fetchJson<T>("/world") 无 Authorization 头
```

**`apps/web/src/lib/api-client.ts`（第 340-342 行）**：
```typescript
export async function getWorldPayloadSafe() {
  return fetchJsonSafe("/world", EMPTY_WORLD_PAYLOAD);
  // 未传第三个参数 token
}
```

**公会页 `apps/web/src/app/guilds/page.tsx`（第 37-38 行）**：
```typescript
const session = await getServerSession();          // 获取了 session（含 token）
const { data: guilds, degraded } = await getGuildListSafe();  // 但未传 token
```

**`apps/web/src/lib/api-client.ts`（第 348-350 行）**：
```typescript
export async function getGuildListSafe() {
  return fetchJsonSafe("/guilds", EMPTY_GUILD_LIST);  // 不接收 token
}
```

**API 端 `apps/api/src/modules/world/world.controller.ts`（第 5-6 行）**：
```typescript
@Controller("world")
@UseGuards(AuthGuard)   // 要求 Bearer Token
```

**API 端 `apps/api/src/modules/guilds/guilds.controller.ts`（第 27-28 行）**：
```typescript
@Controller("guilds")
@UseGuards(AuthGuard)   // 要求 Bearer Token
```

**`fetchJsonSafe` 函数已支持 token 参数（第 304-324 行）**，但 `getWorldPayloadSafe` 和 `getGuildListSafe` 的调用者未使用。

### 2.3 市场方案对比

#### 方案 1: Next.js 官方推荐 — Cookie 透传

Next.js 官方文档（[Authentication Guide](https://nextjs.org/docs/pages/guides/authentication)）推荐在 Server Component 中通过 `cookies()` 读取认证 Cookie，将 token 作为 `Authorization` 头传递给后端 API。

- **优点**: 官方原生支持，无需额外依赖
- **缺点**: 需要每个 Server Component 显式读取 Cookie 并传递

#### 方案 2: Supabase SSR 模式 — 代理刷新

Supabase SSR 方案（[Creating a Client for SSR](https://supabase.com/docs/guides/auth/server-side/creating-a-client)）使用 Server Component 代理机制自动刷新过期 Token 并通过 `request.cookies.set` 传递给下游组件。

- **优点**: 自动刷新 Token，SSR 组件无需手动管理
- **缺点**: 引入 Supabase 依赖，对本项目 NestJS 自建认证体系不适用

#### 方案 3: Khan Academy / Coursera 模式 — BFF 网关

大型教育平台（Khan Academy、Coursera）通常采用 BFF (Backend-for-Frontend) 网关模式，前端 SSR 请求统一经过一个网关层，网关层自动注入认证头。网关层负责：
- 从 Cookie 提取 Session Token
- 转发请求时注入 `Authorization: Bearer <token>` 头
- 处理 Token 过期和刷新

- **优点**: 前端组件无需感知认证细节
- **缺点**: 需要额外搭建 BFF 层，对当前项目架构改动过大

#### 方案 4: Vercel 模式 — Server Action 封装

Vercel 推荐将 API 调用封装为 Server Action 或统一的 Server-side fetch helper，helper 自动从 Cookie 读取 Token 并注入头。

- **优点**: 封装一次，所有 Server Component 复用
- **缺点**: 需要 refactor 现有直接调用模式

### 2.4 推荐方案

**采用方案 1（Cookie 透传）+ 方案 4（统一 Helper 封装）的混合方案**，原因：

1. 项目已有 `getServerSession()` 函数从 Cookie 读取并验证 Token（`apps/web/src/lib/server-session.ts`）
2. `fetchJsonSafe()` 已支持 `token` 参数，无需重构底层
3. 改动最小化，仅需在 Safe 函数签名中添加 token 参数并在 SSR 页面中传入

#### 修改步骤

**步骤 1: 修改 `api-client.ts` 中的 Safe 函数签名**

为 `getWorldPayloadSafe` 和 `getGuildListSafe` 添加可选 `token` 参数：

```typescript
// 修改前
export async function getWorldPayloadSafe() {
  return fetchJsonSafe("/world", EMPTY_WORLD_PAYLOAD);
}

// 修改后
export async function getWorldPayloadSafe(token?: string) {
  return fetchJsonSafe("/world", EMPTY_WORLD_PAYLOAD, token);
}

// 同理修改 getGuildListSafe
export async function getGuildListSafe(token?: string) {
  return fetchJsonSafe("/guilds", EMPTY_GUILD_LIST, token);
}
```

**步骤 2: 修改主页 SSR `apps/web/src/app/page.tsx`**

```typescript
import { getServerSession } from "../lib/server-session";

export default async function HomePage() {
  const session = await getServerSession();
  const { degraded } = await getWorldPayloadSafe(session?.token);
  // ... 其余渲染逻辑不变
}
```

**步骤 3: 修改公会页 SSR `apps/web/src/app/guilds/page.tsx`**

```typescript
export default async function GuildsPage() {
  const session = await getServerSession();
  const { data: guilds, degraded } = await getGuildListSafe(session?.token);
  // ... 其余渲染逻辑不变
}
```

### 2.5 验收标准

| 编号 | 验收项 | 验证方法 |
|------|--------|---------|
| A-1 | 登录后访问主页，不显示"API 暂不可达"降级提示 | 手动登录后访问 `http://localhost:3000/`，页面显示世界数据（currentDay > 0, homesteads 非空） |
| A-2 | 登录后访问公会页，显示公会列表 | 手动登录后访问 `http://localhost:3000/guilds`，页面显示 "Morning Forge" 公会 |
| A-3 | 未登录时主页降级为空态 | 清除 Cookie 后访问主页，显示降级提示 |
| A-4 | API 请求携带 Authorization 头 | 在 API 端添加日志确认 `Authorization: Bearer <token>` 头存在 |

---

## 3. 问题组 B — 种子数据 roomId 格式不匹配 (Critical #3, #4)

### 3.1 问题概述

种子数据中 Room ID 使用 `"room-1"` 格式，而 `RoomsService.getRoomOwnerId()` 要求 `"room-chat-<ownerId>"` 格式，导致所有涉及 roomId 解析的操作（聊天消息查询、房间授权列表）抛出 `BadRequestException`。

### 3.2 证据

**种子数据 `apps/api/prisma/seed.ts`（第 113-114 行）**：
```typescript
rooms: [
  { id: "room-1", homesteadId: "home-1", type: "chat_room", name: "Lin 的聊天室" }
],
```

**种子数据中聊天消息和授权引用 roomId（第 182-227 行）**：
```typescript
chatMessages: [
  { roomId: "room-1", authorId: "student-1", ... },
  // ... 全部使用 "room-1"
],
roomAccessGrants: [
  { roomId: "room-1", granteeId: "student-2", ... },
  { roomId: "room-1", granteeId: "teacher-1", ... },
]
```

**`apps/api/src/modules/rooms/rooms.service.ts`（第 175-187 行）**：
```typescript
private getRoomOwnerId(roomId: string) {
  if (!roomId.startsWith("room-chat-")) {
    throw new BadRequestException(`Invalid room ID format: ${roomId}`);
  }
  const ownerId = roomId.replace("room-chat-", "");
  // ...
}
```

**`listAccessibleRooms` 方法（第 120-156 行）** 对每个 grant 调用 `getRoomOwnerId(grant.roomId)`，当 roomId 为 `"room-1"` 时立即抛出 `BadRequestException`（400 错误）。

### 3.3 市场方案对比

#### 方案 1: 修正种子数据（对齐代码约定）

将种子数据中的 roomId 从 `"room-1"` 改为 `"room-chat-student-1"`，同步修改所有引用该 ID 的 chatMessages 和 roomAccessGrants。

- **优点**: 改动集中在 seed.ts 一个文件，不涉及业务逻辑
- **缺点**: 如果存在已部署的生产数据库，需要数据迁移

#### 方案 2: 放宽 `getRoomOwnerId` 的格式约束

修改 `getRoomOwnerId` 支持多种 roomId 格式，通过数据库查询 Room → Homestead → Owner 关系获取 ownerId。

- **优点**: 前向兼容
- **缺点**: 增加数据库查询，破坏现有约定，可能引入安全风险（用户可构造任意 roomId）

#### 方案 3: 双向适配（种子 + 数据迁移）

同时修改种子数据和添加数据迁移脚本，将已有数据库中的旧格式 roomId 升级。

- **优点**: 最完整的修复
- **缺点**: 当前项目尚在开发阶段，无生产数据需迁移

### 3.4 推荐方案

**采用方案 1（修正种子数据）**，原因：

1. 当前项目处于开发阶段，无生产数据需迁移
2. `room-chat-<ownerId>` 是明确的业务约定（roomId 由 ownerId 派生），种子数据应遵循此约定
3. 改动集中在一个文件，风险可控

#### 修改步骤

**步骤 1: 修改 `apps/api/prisma/seed.ts` 中的 roomId**

将所有 `"room-1"` 替换为 `"room-chat-student-1"`：

```typescript
rooms: [
  { id: "room-chat-student-1", homesteadId: "home-1", type: "chat_room", name: "Lin 的聊天室" }
],

chatMessages: [
  { roomId: "room-chat-student-1", authorId: "student-1", body: "...", ... },
  // ... 所有 roomId 引用
],

roomAccessGrants: [
  { roomId: "room-chat-student-1", granteeId: "student-2", ... },
  { roomId: "room-chat-student-1", granteeId: "teacher-1", ... },
]
```

**步骤 2: 添加种子数据校验**

在 `seedDatabase` 函数末尾添加校验断言，确保所有 roomId 符合 `room-chat-` 前缀约定：

```typescript
// 校验 roomId 格式
for (const room of seedScenario.rooms) {
  if (!room.id.startsWith("room-chat-")) {
    throw new Error(`Seed room ID "${room.id}" does not match "room-chat-<ownerId>" convention`);
  }
}
```

**步骤 3: 重新执行种子脚本**

```bash
DATABASE_URL="postgresql://..." npx ts-node apps/api/prisma/seed.ts
```

> 注意：根据项目经验，Prisma seed 脚本需显式传递 `DATABASE_URL` 环境变量。

### 3.5 验收标准

| 编号 | 验收项 | 验证方法 |
|------|--------|---------|
| B-1 | 种子数据 roomId 符合 `room-chat-<ownerId>` 格式 | 检查 `seed.ts` 中所有 roomId 值均以 `room-chat-` 开头 |
| B-2 | `GET /rooms/accessible-rooms` 返回 200 | 以 student-2 身份登录后调用该接口，返回包含 `room-chat-student-1` 的数组 |
| B-3 | 聊天消息正常加载 | 访问 `/chat?roomId=room-chat-student-1`，页面显示 5 条种子聊天消息 |
| B-4 | 房间授权列表正常显示 | 以 student-1 身份查看 `/rooms/access-grants?roomId=room-chat-student-1`，返回 2 条授权记录 |

---

## 4. 问题组 C — 客户端未传递 Token (High #5, #6)

### 4.1 问题概述

WorldShell 客户端组件在获取 Agent 头像时未传递 Token（导致 `/agent-avatars` 返回 401），WebSocket 连接也未传递认证 Token（导致服务端 `handleConnection` 拒绝连接）。

### 4.2 证据

**Agent 头像获取 `apps/web/src/components/world/world-shell.tsx`（第 92 行）**：
```typescript
const { avatars } = await fetchAgentAvatarsSafe();
// 未传 token，而 fetchAgentAvatarsSafe 内部调用 fetchJsonSafe 不带 token
// API 端 AgentAvatarController 有 @UseGuards(AuthGuard)
```

**对比：Quest 数据获取已正确传 Token（第 78-80 行）**：
```typescript
const session = loadSession();
const token = session?.token;
getQuestListSafe(token).then(({ data }) => setQuests(data)).catch(() => {});
```

**WebSocket 连接（第 118-123 行）**：
```typescript
socket = io(getWsUrl(), {
  transports: ["websocket"],
  autoConnect: true,
  reconnection: true,
  reconnectionAttempts: 3,
});
// 未传 auth token
```

**服务端 WebSocket 认证 `apps/api/src/modules/realtime/realtime.gateway.ts`（第 30-43 行）**：
```typescript
async handleConnection(client: Socket) {
  const token = client.handshake.auth?.token || client.handshake.query?.token;
  if (!token) {
    client.disconnect();   // 无 token → 断开连接
    return;
  }
  // ... 验证 token 有效性
}
```

### 4.3 市场方案对比

#### 方案 1: Socket.IO 官方 JWT 方案 — `auth` 选项传递

Socket.IO 官方文档（[How to use with JWT](https://socket.io/zh-CN/how-to/use-with-jwt)）推荐在客户端连接时通过 `auth` 选项传递 Token：

```javascript
const socket = io(url, {
  auth: { token: myToken }
});
```

服务端通过 `socket.handshake.auth.token` 获取。

- **优点**: 官方推荐，不暴露 Token 在 URL 中，支持 WebSocket-only 传输
- **缺点**: Token 过期后需手动重连

#### 方案 2: `extraHeaders` 方案

通过 `extraHeaders` 传递 Authorization 头：

```javascript
const socket = io(url, {
  extraHeaders: { authorization: `bearer ${myToken}` }
});
```

- **优点**: 复用 HTTP 认证模式
- **缺点**: Socket.IO 官方警告 — **此方案仅在 HTTP long-polling 时生效，WebSocket-only 传输时不工作**。本项目使用 `transports: ["websocket"]`，因此此方案不可行

#### 方案 3: `query` 参数方案

通过 URL query 传递 Token：

```javascript
const socket = io(`${url}?token=${myToken}`);
```

- **优点**: 简单直接
- **缺点**: Token 暴露在 URL/日志中，存在安全风险。服务端 `handleConnection` 已支持 `client.handshake.query?.token` 作为 fallback

### 4.4 推荐方案

**Agent 头像修复**：使用已有的 `fetchAgentAvatarsSafeWithToken` 函数（`api-client.ts` 第 494-503 行已存在但未被调用），替换当前的无 Token 调用。

**WebSocket 修复**：采用方案 1（`auth` 选项），与现有服务端 `client.handshake.auth?.token` 逻辑完全匹配。

#### 修改步骤

**步骤 1: 修复 Agent 头像获取 — `apps/web/src/components/world/world-shell.tsx`**

在 `loadAvatars` 函数中加载 session 并传递 token：

```typescript
async function loadAvatars() {
  const session = loadSession();
  const token = session?.token;

  const { avatars } = token
    ? await fetchAgentAvatarsSafeWithToken(token)
    : await fetchAgentAvatarsSafe();

  if (disposed) return;
  // ... 其余逻辑不变
}
```

需要新增 import：`fetchAgentAvatarsSafeWithToken`（已存在于 `api-client.ts`）。

**步骤 2: 修复 WebSocket 连接 — `apps/web/src/components/world/world-shell.tsx`**

```typescript
const session = loadSession();
const token = session?.token;

socket = io(getWsUrl(), {
  transports: ["websocket"],
  autoConnect: true,
  reconnection: true,
  reconnectionAttempts: 3,
  auth: token ? { token } : undefined,
});
```

### 4.5 验收标准

| 编号 | 验收项 | 验证方法 |
|------|--------|---------|
| C-1 | Agent 头像正常渲染 | 登录后进入主页，Phaser 场景中显示学生 Agent 头像（状态为 online/working 等） |
| C-2 | WebSocket 连接建立成功 | 浏览器 DevTools Network → WS 标签页显示已建立的 WebSocket 连接（状态 101） |
| C-3 | WebSocket 实时更新生效 | 在另一个浏览器窗口以教师身份评审提交，主页 Agent 状态实时更新（无需刷新） |
| C-4 | 未登录时 WebSocket 被拒绝 | 清除 localStorage 后刷新，WebSocket 连接被服务端断开 |

---

## 5. 问题组 D — 中间件不验证 Token 有效性 (High #7)

### 5.1 问题概述

前端中间件仅检查 Cookie 是否存在（非空字符串即可通过），不验证 Token 有效性，导致任意非空字符串都能通过认证检查。

### 5.2 证据

**`apps/web/src/middleware.ts`（第 4-22 行）**：
```typescript
export function middleware(request: NextRequest) {
  const token = request.cookies.get("agent-guild-session-token")?.value;
  // ...
  if (!token && pathname !== "/login") {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  return NextResponse.next();
  // 仅检查 token 存在性，不验证有效性
}
```

**对比：API 端 AuthGuard 会完整验证 Token**（`apps/api/src/modules/auth/auth.guard.ts` 第 14-31 行）：
```typescript
request.authSession = await this.authService.getSession(token);
// 调用数据库验证 token 有效性和过期时间
```

### 5.3 市场方案对比

#### 方案 1: 中间件调用 API 验证 Token

在中间件中发起对 API `/auth/session` 的请求验证 Token 有效性。

- **优点**: 与 API 端验证逻辑完全一致
- **缺点**: 每个请求增加一次 API 往返延迟（中间件运行在 Edge Runtime，不支持直接数据库连接）

#### 方案 2: JWT 本地验证

将 Token 改为 JWT 格式，中间件使用公钥本地验证签名和过期时间，无需 API 往返。

- **优点**: 零延迟验证，无网络开销
- **缺点**: 需要将后端 Token 格式从数据库 Session 改为 JWT，改动较大

#### 方案 3: Next.js 官方推荐 — 轻量中间件 + SSR 验证

Next.js 官方文档推荐中间件仅做"路由保护"（检查 Cookie 存在性），将完整的 Token 有效性验证放在 Server Component 或 Layout 中。如果 Token 无效，在 SSR 层面重定向到登录页。

- **优点**: 中间件保持轻量，不增加延迟；SSR 层验证更灵活（可处理降级场景）
- **缺点**: 需要每个受保护页面显式调用验证

#### 方案 4: Vercel 模式 — 中间件 + SSR 双重检查

Vercel 推荐的"defense in depth"模式：中间件做快速 Cookie 存在性检查（拦截未登录），Server Component 做完整 Token 有效性验证（拦截无效 Token）。

- **优点**: 性能与安全兼顾
- **缺点**: 需要在两层都实现检查

### 5.4 推荐方案

**采用方案 4（中间件 + SSR 双重检查）**，原因：

1. 中间件保持轻量，不引入 API 往返延迟（方案 1 的主要缺点）
2. JWT 改造对现有数据库 Session 体系改动过大（方案 2 不适用）
3. 与问题组 A 的修复天然配合 — SSR 页面已需要调用 `getServerSession()`，该函数会验证 Token 有效性

#### 修改步骤

**步骤 1: 中间件保持现有逻辑，增加 Cookie 格式校验**

在 `apps/web/src/middleware.ts` 中增加对 Token 非空字符串的基本校验（防止纯空格等无效值）：

```typescript
export function middleware(request: NextRequest) {
  const token = request.cookies.get("agent-guild-session-token")?.value;
  const { pathname } = request.nextUrl;

  if (
    pathname.startsWith("/login") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api")
  ) {
    return NextResponse.next();
  }

  // 基本格式校验：非空且非纯空白
  const isValidFormat = token && token.trim().length > 0;

  if (!isValidFormat && pathname !== "/login") {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}
```

**步骤 2: 在受保护页面的 SSR 层增加 Token 有效性验证**

为每个受保护页面（主页、公会页等）在 Server Component 顶部调用 `getServerSession()`，当返回 `null` 时重定向到登录页：

```typescript
// apps/web/src/app/page.tsx
export default async function HomePage() {
  const session = await getServerSession();

  if (!session) {
    redirect("/login");
  }

  const { degraded } = await getWorldPayloadSafe(session.token);
  // ...
}
```

> 注意：此步骤与问题组 A 的修复合并执行，因为两者都需要在 SSR 中调用 `getServerSession()`。

**步骤 3: 抽取公共 Layout 验证（可选优化）**

如果受保护页面较多，可在共享 Layout（如 `apps/web/src/app/(protected)/layout.tsx`）中统一执行 `getServerSession()` 验证，避免每个页面重复代码。

### 5.5 验收标准

| 编号 | 验收项 | 验证方法 |
|------|--------|---------|
| D-1 | 无 Cookie 访问受保护页面被重定向 | 清除 Cookie 后访问 `/`，自动重定向到 `/login` |
| D-2 | 伪造 Token（任意非空字符串）被重定向 | 手动设置 Cookie `agent-guild-session-token=fake-token`，访问 `/`，被重定向到 `/login` |
| D-3 | 有效 Token 正常访问 | 登录后访问 `/`，正常渲染页面 |
| D-4 | 过期 Token 被重定向 | 修改数据库中 session 的 expiresAt 为过去时间，刷新页面后被重定向到 `/login` |

---

## 6. 问题组 E — API 宕机时 SSR 误判 (Medium #9)

### 6.1 问题概述

当 API 服务不可用时，`getServerSession()` 捕获异常并返回 `null`，SSR 层将其误判为"未登录"并重定向到登录页，而非显示"服务暂不可用"的降级提示。

### 6.2 证据

**`apps/web/src/lib/server-session.ts`（第 5-18 行）**：
```typescript
export async function getServerSession(): Promise<AuthSession | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_TOKEN_COOKIE)?.value;

  if (!token) {
    return null;   // 情况 1: 无 Cookie → 确实未登录
  }

  try {
    return await getCurrentSession(token);
  } catch {
    return null;   // 情况 2: API 异常 → 误判为未登录
  }
}
```

两种 `null` 返回值语义不同，但调用方无法区分。

### 6.3 市场方案对比

#### 方案 1: 三态返回（session | null | error）

将 `getServerSession()` 返回值从 `AuthSession | null` 改为 `{ session: AuthSession | null; error: boolean }`，调用方根据 `error` 区分"未登录"和"API 不可用"。

- **优点**: 语义清晰，调用方可精确处理
- **缺点**: 需修改所有调用方代码

#### 方案 2: 抛出异常 + 调用方捕获

API 异常时不 catch，让异常传播到 Server Component 层，由调用方决定降级策略。

- **优点**: 符合 Next.js Error Boundary 模式
- **缺点**: 需要每个页面配置 error.tsx 错误边界

#### 方案 3: Supabase 模式 — 降级而非重定向

Supabase SSR 在 Token 刷新失败时不会立即重定向，而是返回一个"未认证但非错误"的中间状态，让页面渲染降级 UI。

- **优点**: 用户体验更好（不会因 API 临时抖动就被踢出登录）
- **缺点**: 实现复杂度较高

### 6.4 推荐方案

**采用方案 1（三态返回）**，原因：

1. 改动集中在 `server-session.ts` 一个文件 + 各页面调用方
2. 语义清晰，易于测试和维护
3. 与问题组 A、D 的修改同步进行，边际成本低

#### 修改步骤

**步骤 1: 修改 `getServerSession()` 返回类型**

```typescript
export type ServerSessionResult =
  | { status: "authenticated"; session: AuthSession }
  | { status: "unauthenticated" }
  | { status: "api-unreachable" };

export async function getServerSession(): Promise<ServerSessionResult> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_TOKEN_COOKIE)?.value;

  if (!token) {
    return { status: "unauthenticated" };
  }

  try {
    const session = await getCurrentSession(token);
    return { status: "authenticated", session };
  } catch {
    return { status: "api-unreachable" };
  }
}
```

**步骤 2: 修改 SSR 页面调用方**

```typescript
// apps/web/src/app/page.tsx
export default async function HomePage() {
  const result = await getServerSession();

  if (result.status === "unauthenticated") {
    redirect("/login");
  }

  // api-unreachable 时：仍然尝试加载世界数据（会降级），不重定向
  const token = result.status === "authenticated" ? result.session.token : undefined;
  const { degraded } = await getWorldPayloadSafe(token);

  // ... 渲染逻辑
}
```

### 6.5 验收标准

| 编号 | 验收项 | 验证方法 |
|------|--------|---------|
| E-1 | API 正常时登录用户正常访问 | API 运行时登录后访问主页，正常渲染 |
| E-2 | API 宕机时已登录用户看到降级提示而非重定向 | 停止 API 服务，刷新主页，页面显示"API 暂不可达"降级提示，不被重定向到登录页 |
| E-3 | API 宕机时未登录用户仍被重定向 | 停止 API 服务，清除 Cookie 后访问主页，被重定向到登录页 |
| E-4 | API 恢复后页面自动恢复 | 重启 API 服务后刷新页面，数据正常加载 |

---

## 7. 问题组 F — 不存在资源返回 500 (Medium #10, #11)

### 7.1 问题概述

`POST /reviews/decide` 和 `POST /rooms/access-grants/:id/revoke` 对不存在的资源 ID 使用 `findUniqueOrThrow`，Prisma 抛出 `NotFoundError` 未被捕获，导致返回 500 Internal Server Error 而非语义正确的 404 Not Found。

### 7.2 证据

**`apps/api/src/modules/reviews/reviews.controller.ts`（第 116-119 行）**：
```typescript
const existingReview = await this.prisma.reviewResult.findUniqueOrThrow({
  where: { submissionId: body.submissionId },
  select: { status: true, submission: { select: { studentId: true } } }
});
// findUniqueOrThrow 在记录不存在时抛出 Prisma NotFoundError → NestJS 默认异常过滤器返回 500
```

**`apps/api/src/modules/rooms/rooms.service.ts`（第 49-51 行）**：
```typescript
const existingGrant = await this.prisma.roomAccessGrant.findUniqueOrThrow({
  where: { id: grantId }
});
// 同样的问题
```

**API 端无自定义异常过滤器**：项目中不存在任何 `@Catch()` 全局异常过滤器（已通过文件搜索确认），Prisma 错误由 NestJS 默认异常处理器处理，返回 500。

### 7.3 市场方案对比

#### 方案 1: 使用 `findUnique` + 手动 404

将 `findUniqueOrThrow` 替换为 `findUnique`，当返回 `null` 时手动抛出 `NotFoundException`（404）。

- **优点**: 精确控制 HTTP 状态码，符合 RESTful 语义
- **缺点**: 需要逐个修改调用点

#### 方案 2: 全局 Prisma 异常过滤器

添加全局 `@Catch(PrismaClientKnownRequestError)` 异常过滤器，将 Prisma 的 `P2025` 错误（记录不存在）统一映射为 404。

- **优点**: 一次性解决所有 `findUniqueOrThrow` 的 500 问题，无需逐个修改
- **缺点**: 无法区分不同业务场景的 404 语义

#### 方案 3: NestJS 官方推荐 — 二者结合

NestJS 官方推荐同时使用全局异常过滤器（兜底）+ 关键路径手动处理（精确语义）。

- **优点**: 既有兜底保障，又有精确控制
- **缺点**: 实现量稍大

### 7.4 推荐方案

**采用方案 3（全局过滤器 + 关键路径手动处理）**，原因：

1. 全局过滤器作为兜底，防止未来其他 `findUniqueOrThrow` 调用再次出现 500
2. 关键路径（reviews/decide、rooms/revoke）手动处理，提供精确的错误消息

#### 修改步骤

**步骤 1: 创建全局 Prisma 异常过滤器**

新建文件 `apps/api/src/filters/prisma-exception.filter.ts`：

```typescript
import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus } from "@nestjs/common";
import { BaseExceptionFilter } from "@nestjs/core";
import { Prisma } from "@prisma/client";
import { Response } from "express";

@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaExceptionFilter extends BaseExceptionFilter {
  catch(exception: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    // P2025: An operation failed because it depends on one or more records that were required but not found
    if (exception.code === "P2025") {
      response.status(HttpStatus.NOT_FOUND).json({
        statusCode: HttpStatus.NOT_FOUND,
        message: "Resource not found",
        error: "Not Found",
      });
      return;
    }

    // 其他 Prisma 错误保持 500
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: "Internal server error",
    });
  }
}
```

**步骤 2: 注册全局过滤器**

在 `apps/api/src/main.ts` 中注册：

```typescript
import { PrismaExceptionFilter } from "./filters/prisma-exception.filter";

// ...
app.useGlobalFilters(new PrismaExceptionFilter());
```

**步骤 3: 关键路径手动处理（可选，提供更精确的错误消息）**

```typescript
// reviews.controller.ts — decide 方法
const existingReview = await this.prisma.reviewResult.findUnique({
  where: { submissionId: body.submissionId },
  select: { status: true, submission: { select: { studentId: true } } }
});

if (!existingReview) {
  throw new NotFoundException(`Review for submission ${body.submissionId} not found`);
}

// rooms.service.ts — revokeGrant 方法
const existingGrant = await this.prisma.roomAccessGrant.findUnique({
  where: { id: grantId }
});

if (!existingGrant) {
  throw new NotFoundException(`Access grant ${grantId} not found`);
}
```

### 7.5 验收标准

| 编号 | 验收项 | 验证方法 |
|------|--------|---------|
| F-1 | `POST /reviews/decide` 对不存在的 submissionId 返回 404 | 使用不存在的 submissionId（如 `sub-nonexistent`）调用接口，返回 HTTP 404 |
| F-2 | `POST /rooms/access-grants/:id/revoke` 对不存在的 grantId 返回 404 | 使用不存在的 grantId 调用接口，返回 HTTP 404 |
| F-3 | 正常请求不受影响 | 使用有效的 submissionId/grantId 调用接口，返回 200 |
| F-4 | 404 响应体包含有意义的错误信息 | 检查响应 JSON 中 `message` 字段包含资源 ID |

---

## 8. 实施优先级与依赖关系

### 8.1 优先级矩阵

| 优先级 | 问题组 | 影响范围 | 预估工时 | 依赖 |
|--------|--------|---------|---------|------|
| P0 | B — 种子数据 roomId 修正 | 全局数据一致性 | 0.5h | 无 |
| P0 | A — SSR Token 传递 | 主页 + 公会页 | 1h | 无 |
| P1 | D — 中间件 + SSR 验证 | 全站认证 | 1.5h | A（SSR 验证复用） |
| P1 | C — 客户端 Token 传递 | 主页实时功能 | 1h | 无 |
| P2 | E — API 宕机 SSR 降级 | 容错体验 | 1h | A（修改 getServerSession） |
| P2 | F — 404 错误处理 | API 健壮性 | 1h | 无 |

### 8.2 实施顺序

```
B (种子数据) ────────────────────────────────► 独立执行
A (SSR Token) ──► D (SSR 验证) ──► E (降级优化)
C (客户端 Token) ─────────────────────────────► 独立执行
F (404 处理) ─────────────────────────────────► 独立执行
```

### 8.3 建议分批交付

- **第一批（P0）**: B + A — 修复核心数据一致性和 SSR 数据加载
- **第二批（P1）**: D + C — 修复认证安全性和实时功能
- **第三批（P2）**: E + F — 优化容错和错误处理

---

## 9. 附录：技术参考

### 9.1 引用的项目文件

| 文件 | 用途 |
|------|------|
| `apps/web/src/app/page.tsx` | 主页 SSR — 问题 A、D、E |
| `apps/web/src/app/guilds/page.tsx` | 公会页 SSR — 问题 A、D |
| `apps/web/src/lib/api-client.ts` | API 客户端 — 问题 A、C（fetchJsonSafe 已支持 token 参数） |
| `apps/web/src/lib/server-session.ts` | 服务端 Session 获取 — 问题 A、D、E |
| `apps/web/src/lib/session.ts` | 客户端 Session 管理 — 问题 C（loadSession 已可用） |
| `apps/web/src/components/world/world-shell.tsx` | WebSocket + 头像获取 — 问题 C |
| `apps/web/src/middleware.ts` | 前端中间件 — 问题 D |
| `apps/api/prisma/seed.ts` | 种子数据 — 问题 B |
| `apps/api/src/modules/rooms/rooms.service.ts` | 房间服务（getRoomOwnerId） — 问题 B、F |
| `apps/api/src/modules/reviews/reviews.controller.ts` | 评审控制器（decide 方法） — 问题 F |
| `apps/api/src/modules/world/world.controller.ts` | 世界控制器（@UseGuards(AuthGuard)） — 问题 A 证据 |
| `apps/api/src/modules/guilds/guilds.controller.ts` | 公会控制器（@UseGuards(AuthGuard)） — 问题 A 证据 |
| `apps/api/src/modules/memory/agent-avatar/agent-avatar.controller.ts` | 头像控制器（@UseGuards(AuthGuard)） — 问题 C 证据 |
| `apps/api/src/modules/realtime/realtime.gateway.ts` | WebSocket 网关（handleConnection） — 问题 C 证据 |
| `apps/api/src/modules/auth/auth.guard.ts` | API 认证守卫 — 问题 D 对比证据 |

### 9.2 外部技术参考

| 参考 | 链接 | 相关问题 |
|------|------|---------|
| Next.js Authentication Guide | https://nextjs.org/docs/pages/guides/authentication | A、D |
| Supabase SSR Client Guide | https://supabase.com/docs/guides/auth/server-side/creating-a-client | A、E |
| Socket.IO JWT Authentication | https://socket.io/zh-CN/how-to/use-with-jwt | C |
| Next.js Security Best Practices (Authgear) | https://www.authgear.com/post/nextjs-security-best-practices/ | D |
| Securing Web Apps with Next.js + Nest.js (Medium) | https://medium.com/reversebits/securing-web-applications-with-next-js-and-nest-js-178de7d47316 | A、D |

### 9.3 关键设计决策

| 决策 | 选择 | 理由 |
|------|------|------|
| SSR Token 传递方式 | Cookie 透传 + Safe 函数 token 参数 | 复用已有基础设施（getServerSession + fetchJsonSafe），改动最小 |
| WebSocket Token 传递方式 | Socket.IO `auth` 选项 | 官方推荐，支持 WebSocket-only 传输，服务端已兼容 |
| 中间件验证策略 | 轻量 Cookie 检查 + SSR 完整验证 | 兼顾性能与安全，避免中间件 API 往返 |
| 种子数据修复策略 | 修正 seed.ts 对齐代码约定 | 开发阶段无生产数据，改动集中 |
| 404 错误处理策略 | 全局 Prisma 过滤器 + 关键路径手动处理 | 兜底保障 + 精确语义 |
| API 不可用降级策略 | 三态返回（authenticated / unauthenticated / api-unreachable） | 语义清晰，避免误判 |

---

> **文档结束** — 本 PRD 涵盖 4 个 Critical、3 个 High、3 个 Medium 共 11 个问题的完整分析与修复方案。建议按优先级矩阵分三批实施。
