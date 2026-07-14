# PRD：实时系统与 UI 体验优化

> **文档状态**：草案 v1.0
> **角色**：产品官
> **日期**：2026-07-08
> **范围**：16 项审查问题，分为实时系统、UI/UX、AI Agent 视角三组

---

## 目录

- [问题组 A：实时系统（问题 1-3）](#问题组-a实时系统问题-1-3)
- [问题组 B：UI/UX 体验（问题 4-10）](#问题组-buiux-体验问题-4-10)
- [问题组 C：AI Agent 视角（问题 11-16）](#问题组-cai-agent-视角问题-11-16)
- [附录：市场方案参考索引](#附录市场方案参考索引)

---

## 问题组 A：实时系统（问题 1-3）

### A-1. WebSocket 连接未传认证 Token，实时功能完全失效

#### 问题概述

`WorldShell` 组件在建立 Socket.IO 连接时**未传递认证 Token**，而服务端 `RealtimeGateway.handleConnection` 强制校验 Token 并拒绝无 Token 的连接，导致 WebSocket 实时通道完全不可用，所有实时功能（Agent 状态更新、聊天消息推送）静默失败。

**证据**：
- 客户端 `apps/web/src/components/world/world-shell.tsx:118-123`：
  ```ts
  socket = io(getWsUrl(), {
    transports: ["websocket"],
    autoConnect: true,
    reconnection: true,
    reconnectionAttempts: 3,
  });
  ```
  连接选项中**没有 `auth` 字段**，也未从 `loadSession()` 获取 token 传入。
- 服务端 `apps/api/src/modules/realtime/realtime.gateway.ts:30-43`：
  ```ts
  async handleConnection(client: Socket) {
    const token = client.handshake.auth?.token || client.handshake.query?.token;
    if (!token) { client.disconnect(); return; }
    // ...
  }
  ```
  无 Token 时直接断开连接。
- 连接失败被 `try/catch` 静默吞掉（`world-shell.tsx:157-159`），仅保留 30s REST 轮询作为降级。

#### 市场方案对比

| 维度 | Discord Gateway | Slack Socket Mode | Figma Multiplayer | 当前项目 |
|------|----------------|-------------------|-------------------|----------|
| 认证方式 | 连接时携带 Bot Token，通过 IDENTIFY op 发送 | WebSocket 握手时传 app-level token | 连接时携带 session token 于 auth header | **无认证** |
| 连接管理 | 心跳保活 + RESUME 会话恢复 | 自动重连 + 事件去重 | 离线缓冲 + 重连后增量同步 | 3 次重试后放弃 |
| 降级策略 | REST 轮询 fallback | HTTP Events API fallback | 离线编辑队列 | 30s REST 轮询 |
| 错误可见性 | 连接状态指示器（在线/重连中/离线） | 连接状态事件 | 协作者光标消失提示 | **静默失败** |

**关键洞察**：
- Discord/Slack 都在**连接建立前**完成认证，认证失败不会建立连接
- Socket.IO 官方文档明确推荐使用 `auth` 选项传递凭证（而非 query string），避免 token 泄露在 URL 日志中
- Figma 的核心经验是：连接断开不应静默，应向用户展示连接状态

#### 推荐方案

**步骤 1：客户端连接时传入 Token**

在 `world-shell.tsx` 的 socket 初始化处，从 session 获取 token 并通过 `auth` 选项传入：

```ts
const session = loadSession();
const token = session?.token;

socket = io(getWsUrl(), {
  transports: ["websocket"],
  autoConnect: true,
  reconnection: true,
  reconnectionAttempts: 3,
  auth: { token },  // 关键修复：传入认证 Token
});
```

**步骤 2：增加连接状态反馈**

参考 Discord 的连接状态指示器，在 UI 中展示 WebSocket 连接状态（连接中/已连接/重连中/离线降级），而非静默失败：

```ts
const [wsStatus, setWsStatus] = useState<"connecting" | "connected" | "reconnecting" | "offline">("connecting");

socket.on("connect", () => setWsStatus("connected"));
socket.on("disconnect", () => setWsStatus("reconnecting"));
socket.on("reconnect_failed", () => setWsStatus("offline"));
```

**步骤 3：连接失败时自动降级到轮询**

参考 Slack 的降级策略，当 WebSocket 连接失败后，将 REST 轮询间隔从 30s 缩短到 10s，并在连接恢复后停止轮询。

#### 验收标准

1. 登录后进入主页，浏览器 DevTools Network 面板可见 WebSocket 连接状态为 101 Switching Protocols（非 403/断开）
2. WebSocket 连接握手时 `auth.token` 字段携带有效 session token
3. 连接断开时 UI 显示"重连中..."提示，3 次重试失败后显示"离线模式（10s 轮询）"
4. 连接恢复后实时推送正常工作，轮询自动停止
5. Token 过期时连接被服务端拒绝，客户端引导用户重新登录

---

### A-2. 无评审状态变更的实时推送事件，AI Agent 只能轮询

#### 问题概述

`RealtimeGateway` 仅提供 `broadcastPresence`、`broadcastAgentStatus`、`broadcastNewMessage` 三种广播方法，**缺少评审状态变更推送**。教师做出评审决定后，学生端的 Agent 头像状态和评审结果只能依赖 30s REST 轮询发现，造成明显的感知延迟。

**证据**：
- `realtime.gateway.ts:46-63`：仅有 presence、agent-status、chat:message 三个事件
- `reviews.controller.ts:144-155`：`decide` 方法中仅调用 `broadcastAgentStatus`，**未推送评审结果变更事件**
- `agent-avatar.service.ts`：状态推导依赖数据库查询，无实时事件驱动
- `world-shell.tsx:111-113`：30s 轮询间隔作为唯一更新途径

#### 市场方案对比

| 维度 | Linear | GitHub | Slack | 当前项目 |
|------|--------|--------|-------|----------|
| 状态变更推送 | WebSocket 推送 issue/PR 状态变更 | WebSocket + Webhook 双通道 | Events API 实时推送 | **无推送** |
| 推送粒度 | 精确到字段级别（status/assignee/label） | 精确到事件类型 | 频道级事件 | — |
| 客户端处理 | 增量更新本地缓存 | 重新拉取变更资源 | 事件去重 + 本地合并 | 全量轮询覆盖 |
| 降级策略 | 重连后同步 missed events | ETag 缓存 + 轮询 | HTTP Events API fallback | 30s 轮询 |

**关键洞察**：
- Linear 的做法是：状态变更时推送 `{ type, entityId, changes }` 结构化事件，客户端增量更新本地缓存，避免全量重拉
- GitHub 使用 WebSocket + Webhook 双通道保证可靠性
- 当前项目已有 `broadcastAgentStatus` 基础设施，只需新增评审事件类型

#### 推荐方案

**步骤 1：在 RealtimeGateway 新增评审事件广播方法**

在 `realtime.gateway.ts` 中新增：

```ts
broadcastReviewUpdate(payload: {
  submissionId: string;
  studentId: string;
  reviewStatus: "queued" | "ai_reviewed" | "teacher_decided";
  suggestedScore: number | null;
  finalScore: number | null;
  decision: "approve" | "adjust" | "reject" | null;
  timestamp: string;
}) {
  this.server.emit("review:update", payload);
}
```

**步骤 2：在评审流程关键节点触发推送**

在以下位置调用 `broadcastReviewUpdate`：
- `review.processor.ts` AI 评审完成时（`status` 变为 `ai_reviewed`）
- `reviews.controller.ts` 教师做出决定时（`status` 变为 `teacher_decided`）

**步骤 3：客户端订阅评审事件**

在 `world-shell.tsx` 中监听 `review:update` 事件，更新对应学生的 Agent 头像状态和任务日志，无需等待 30s 轮询。

**步骤 4：保留轮询作为降级兜底**

参考 Slack 的策略，WebSocket 不可用时仍保留轮询，但将间隔动态调整：连接正常时 60s（仅兜底），离线时 10s。

#### 验收标准

1. AI 评审完成后，学生端 Agent 头像在 2s 内从"编码中"变为"评审中"（无需等待轮询）
2. 教师做出评审决定后，学生端在 2s 内收到评审结果通知
3. WebSocket 断开时，轮询兜底仍能在 10s 内获取最新状态
4. 评审事件 payload 包含足够信息（submissionId、status、score、decision），客户端无需额外请求

---

### A-3. 消息创建后有 WebSocket 推送但连接不通

#### 问题概述

`ChatService.createMessage` 在消息创建后调用 `gateway.broadcastNewMessage(payload)` 推送，但客户端聊天室组件 `RoomMessages` **完全未建立 WebSocket 连接**，仅依赖 10s REST 轮询。同时由于问题 A-1 的 WebSocket 连接不通，即使建立了连接也无法收到推送。

**证据**：
- `chat.service.ts:202`：`this.gateway.broadcastNewMessage(payload)` 已实现
- `room-messages.tsx:181-214`：仅使用 `setInterval(poll, 10_000)` 轮询，**无 socket.io 监听**
- `world-shell.tsx` 中的 socket 监听了 `agent-status:update` 但**未监听 `chat:message`**
- 服务端 `broadcastNewMessage` 使用 `this.server.emit`（全局广播），未按 roomId 分频道

#### 市场方案对比

| 维度 | Discord | Slack | 当前项目 |
|------|---------|-------|----------|
| 消息推送 | WebSocket 实时推送，按 channel/guild 分发 | WebSocket 实时推送，按 channel 分发 | 全局广播（不分频道） |
| 消息顺序保证 | 服务端序号 + 客户端排序 | 时间戳 + 客户端去重 | 客户端按 (createdAt, id) 排序去重 |
| 离线消息 | 重连后同步 missed messages | 标记已读位置 + 增量拉取 | 10s 轮询拉取最近 50 条 |
| 发送反馈 | 乐观更新 + 服务端确认 | 乐观更新 + 服务端确认 | 乐观更新（无服务端确认机制） |

**关键洞察**：
- Discord/Slack 都按频道（channel/room）分发消息，而非全局广播，避免无关消息打扰
- 当前项目使用 `this.server.emit`（广播给所有连接），应改为按 roomId 分频道：`this.server.to(roomId).emit`
- 客户端需要在连接时 `join` 对应房间频道

#### 推荐方案

**步骤 1：服务端按 roomId 分频道推送**

在 `realtime.gateway.ts` 中修改 `broadcastNewMessage`：

```ts
broadcastNewMessage(message: { roomId: string; /* ... */ }) {
  this.server.to(message.roomId).emit("chat:message", message);
}
```

在 `handleConnection` 中，认证通过后让客户端加入其有权访问的房间频道。

**步骤 2：客户端聊天室组件建立 WebSocket 连接并监听消息**

在 `room-messages.tsx` 中新增 Socket.IO 连接（传入 token），监听 `chat:message` 事件实时更新消息列表，同时保留 10s 轮询作为降级兜底。

**步骤 3：连接时加入房间频道**

客户端连接成功后发送 `join` 事件加入当前 `roomId` 频道，服务端校验权限后调用 `client.join(roomId)`。

#### 验收标准

1. 在聊天室页面发送消息后，同房间的其他用户在 1s 内看到新消息（无需等待 10s 轮询）
2. 消息推送仅分发给同房间用户，不影响其他房间
3. WebSocket 断开时，10s 轮询仍能获取新消息
4. 消息顺序正确，无重复（客户端按 id 去重）

---

## 问题组 B：UI/UX 体验（问题 4-10）

### B-4. 会话持久化不稳定——从主页导航到 /chat 时偶尔被重定向到登录页

#### 问题概述

Session token 存储在 `localStorage` 和 `document.cookie` 中（客户端写入）。Next.js 中间件（`middleware.ts`）在服务端检查 cookie 中的 token 来决定是否重定向。由于 cookie 由客户端 JavaScript 设置，存在**时序竞态**：首次导航或 SessionBanner 重新校验失败时，cookie 可能不存在或已过期，导致中间件误判为未登录并重定向到 `/login`。

**证据**：
- `session.ts:35`：`saveSession` 通过 `window.document.cookie` 设置 cookie — 客户端写入，服务端 SSR 渲染时可能尚未生效
- `middleware.ts:5,18`：`request.cookies.get("agent-guild-session-token")` — 服务端中间件检查 cookie，不存在则重定向
- `session-banner.tsx:36-46`：`getCurrentSession` 失败时仅在 401/403 清除 session；网络超时（5s）也会导致 `setSession(null)`，但不清除 cookie — 然而 cookie 的 `max-age=28800`（8 小时）可能与服务端 session 过期不同步
- `server-session.ts:13-17`：`getServerSession` 调用 API 校验 token，API 不可达时返回 null，但页面自行处理（非中间件重定向）

#### 市场方案对比

| 维度 | Notion | Linear | GitHub | 当前项目 |
|------|--------|--------|--------|----------|
| Token 存储 | HttpOnly cookie（服务端设置） | HttpOnly cookie + CSRF token | HttpOnly cookie | **客户端 document.cookie** |
| 中间件校验 | 校验 cookie 存在性 + 服务端验证 | 校验 cookie + 重定向带 next 参数 | 校验 session + 角色路由 | 仅校验 cookie 存在性 |
| 过期处理 | 刷新 token 机制 | 静默刷新 + 重定向 | session 续期 | 8h 硬过期，无刷新 |
| 网络错误处理 | 保留登录态，显示离线提示 | 保留登录态，重试 | 保留登录态 | **可能清除 session** |

**关键洞察**：
- Notion/Linear/GitHub 都使用 **HttpOnly + Secure cookie**，由服务端在登录响应中通过 `Set-Cookie` header 设置，而非客户端 JavaScript
- 客户端写入的 cookie 在 SSR 导航时可能尚未同步，这是根本原因
- GitHub 的做法是：中间件仅做"快速检查"（cookie 存在性），真正的鉴权在每个页面的服务端逻辑中完成

#### 推荐方案

**步骤 1：登录时由 API 服务端设置 HttpOnly cookie**

在 `auth.controller.ts` 的 `login` 方法中，通过 `Set-Cookie` response header 设置 HttpOnly cookie：

```ts
@Post("login")
async login(@Body() body: LoginDto, @Res() res: Response) {
  const session = await this.authService.login(body.email, body.password);
  res.cookie(SESSION_TOKEN_COOKIE, session.token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 28800,
    path: "/",
  });
  return res.json(session);
}
```

**步骤 2：前端 saveSession 不再设置 cookie**

`session.ts` 的 `saveSession` 仅保存到 `localStorage`（供客户端 API 调用使用），cookie 由服务端管理。

**步骤 3：middleware 增加角色感知重定向**

```ts
export function middleware(request: NextRequest) {
  const token = request.cookies.get(SESSION_TOKEN_COOKIE)?.value;
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/login") || pathname.startsWith("/_next") || pathname.startsWith("/api")) {
    return NextResponse.next();
  }

  if (!token) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);  // 保存来源路径
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}
```

**步骤 4：网络错误时保留登录态**

`session-banner.tsx` 中，网络错误（非 401/403）时不清除 session，仅标记为"离线"状态。

#### 验收标准

1. 登录后从主页导航到 /chat、/guilds、/teacher 均不会被重定向到登录页
2. 刷新页面后会话保持有效（cookie 由服务端管理，SSR 可读）
3. Token 过期后才重定向到登录页，且登录后自动跳回原页面（`next` 参数）
4. API 暂时不可达时，页面显示"离线"提示但不强制登出
5. Cookie 标记为 HttpOnly，无法通过 `document.cookie` 读取（防 XSS）

---

### B-5. 多个页面显示 API 降级提示（主页、公会页、教师工作台、学情面板）

#### 问题概述

主页 `page.tsx` 调用 `getWorldPayloadSafe()` 时**未传入 token**，而 `/world` 端点要求 `AuthGuard` 认证，导致请求必然返回 401 → 触发降级。同样，`getGuildListSafe()` 也未传 token。这是"假降级"——API 实际可用，但因缺少认证 token 而失败。

**证据**：
- `page.tsx:9`：`const { degraded } = await getWorldPayloadSafe();` — 无 token 参数
- `api-client.ts:340-342`：`getWorldPayloadSafe()` 调用 `fetchJsonSafe("/world", EMPTY_WORLD_PAYLOAD)` — 无 token
- `world.controller.ts:6`：`@UseGuards(AuthGuard)` — 要求认证
- `guilds/page.tsx:38`：`getGuildListSafe()` 同样无 token，而 `/guilds` 也要求 AuthGuard
- 降级提示样式不一致：主页用 `#f87171`，聊天页用 `rgba(239, 68, 68, 0.1)` 背景

#### 市场方案对比

| 维度 | GitHub Primer | Linear | 当前项目 |
|------|---------------|--------|----------|
| 降级分级 | 区分 primary/secondary 体验 | 区分核心/辅助功能 | **统一红色提示** |
| 降级展示 | 全局 Banner + 上下文内联提示 | 面板级空态 + 重试按钮 | 底部红色文字 |
| 错误文案 | "Some content may be unavailable. Try refreshing." | "Failed to load. Retry." | "实时教学 API 暂不可达" |
| 隐藏 vs 替换 | secondary 体验直接隐藏；primary 替换为 blankslate | 辅助区域隐藏，核心区域显示重试 | **始终显示提示** |
| 数量控制 | 单页不超过 5 条降级提示 | 合并同类错误 | 多处独立提示 |

**关键洞察**（来自 GitHub Primer Degraded Experiences 指南）：
- 区分"主体验"和"次体验"：主体验不可用时显示错误页，次体验不可用时直接隐藏该区域
- 全局 Banner 用于告知用户"部分功能可能不可用"，上下文内仅替换受影响的具体 UI
- 不要让用户误以为数据丢失——显示"暂不可用"而非空列表
- 单页降级提示不超过 5 条，避免页面看起来"全是错误"

#### 推荐方案

**步骤 1：修复认证 token 传递（根因修复）**

主页和公会页的 SSR 数据获取应传入 session token：

```ts
// page.tsx
const session = await getServerSession();
const { degraded } = await getWorldPayloadSafe(session?.token);
```

`getWorldPayloadSafe` 和 `getGuildListSafe` 需增加可选 token 参数（已有 `fetchJsonSafe` 支持 token）。

**步骤 2：建立分级降级策略**

参考 GitHub Primer，将降级分为三级：
- **L1 全局 Banner**：API 整体不可用时，页面顶部显示"部分功能可能暂时不可用"
- **L2 区域替换**：单个面板不可用时，用 Blankslate 组件替换（含图标 + 说明 + 重试按钮）
- **L3 静默隐藏**：非关键辅助信息（如计数器、活动指示器）不可用时直接隐藏

**步骤 3：统一降级提示组件**

创建 `<DegradedNotice>` 组件，统一样式（参考 Primer 的 warning variant）：
- 图标 + 说明文字 + 可选重试按钮
- 颜色使用 `fg.warning`（amber）而非 `fg.danger`（red），降低视觉冲击
- 深色背景下确保 WCAG AA 对比度（≥ 4.5:1）

#### 验收标准

1. 登录后主页、公会页不再显示"API 暂不可达"降级提示（token 正确传递）
2. API 真正不可用时，显示统一的降级提示组件（amber 色，含重试按钮）
3. 单页降级提示不超过 3 条，合并同类错误
4. 降级提示在深色背景下对比度 ≥ 4.5:1（WCAG AA）
5. 非关键辅助信息（如计数器）不可用时静默隐藏，不显示错误

---

### B-6. NPC 交互无法通过常规方式点击（Phaser Canvas 渲染）

#### 问题概述

NPC 通过 Phaser Graphics API 在 Canvas 上渲染，交互依赖 `setInteractive` 的透明 hit area。该方案存在三个问题：(1) hit area 可能与 NPC 视觉区域不精确匹配；(2) Canvas 元素无法被键盘 Tab 聚焦，屏幕阅读器无法访问；(3) 移动端触摸区域可能偏小。

**证据**：
- `phaser-scene.ts:434-442`：hit area 为 `s.add.rectangle(0, -6, 50, 50, 0x000000, 0)` — 50x50 像素透明矩形，位于 container 内部
- NPC 视觉由多个 Graphics 绘制（身体、头部等），hit area 可能未完全覆盖
- 无 ARIA 标记、无 keyboard 可访问性

#### 市场方案对比

| 维度 | Duolingo | ClassDojo | 当前项目 |
|------|----------|-----------|----------|
| NPC 交互方式 | 角色 SVG/Canvas + DOM 叠层按钮 | 角色 CSS + DOM 点击区域 | **纯 Canvas hit area** |
| 可访问性 | 全键盘可操作 + ARIA 标签 | 触摸友好大按钮 | **无键盘/ARIA 支持** |
| 视觉反馈 | hover 高亮 + 点击动画 + 音效 | hover 放大 + 粒子效果 | 仅 handCursor |
| 移动端适配 | 触摸区域 ≥ 44x44pt | 大触摸目标 | 50x50px（偏小） |

**关键洞察**：
- Duolingo 的做法是：游戏角色在 Canvas/SVG 中渲染，但在角色上方叠加**不可见的 DOM 按钮**（`position: absolute`），既保留视觉效果又保证可访问性
- ClassDojo 使用纯 DOM 元素（CSS 动画），天然支持触摸和键盘
- WCAG 2.1 要求触摸目标 ≥ 44x44 CSS 像素

#### 推荐方案

**步骤 1：在 NPC 上方叠加 DOM 交互层**

在 `world-shell.tsx` 中，根据当前 zone 的 NPC 定义，渲染一组定位在 NPC 上方的不可见 `<button>` 元素：

```tsx
{ZONE_DEFS.find(z => z.id === activeZone)?.npcs.map(npc => (
  <button
    key={npc.id}
    aria-label={`与 ${npc.name} 对话`}
    onClick={() => setActiveNpc(npc.id)}
    style={{
      position: "absolute",
      left: `${npc.x * scaleRatio}px`,
      top: `${npc.y * scaleRatio}px`,
      width: 64,
      height: 64,
      background: "transparent",
      border: "none",
      cursor: "pointer",
      zIndex: 5,
    }}
  />
))}
```

**步骤 2：保留 Phaser 内 hit area 作为视觉反馈触发器**

Phaser 内的 hit area 仍保留用于 hover 高亮效果，但点击操作由 DOM 按钮处理。

**步骤 3：增加 hover/active 视觉反馈**

参考 Duolingo，NPC hover 时显示名称气泡 + 角色高亮动画，点击时播放缩放反馈。

**步骤 4：增加键盘可访问性**

DOM 按钮天然支持 Tab 聚焦和 Enter 触发，添加 `:focus-visible` 样式指示器。

#### 验收标准

1. NPC 可通过鼠标点击、触摸点击、键盘 Tab+Enter 三种方式交互
2. NPC 交互区域 ≥ 44x44 CSS 像素（移动端可访问性）
3. hover 时显示 NPC 名称提示，点击后弹出对话窗口
4. 屏幕阅读器能识别 NPC 按钮并朗读 aria-label
5. Phaser Canvas 渲染不受 DOM 叠层影响（视觉无遮挡）

---

### B-7. 错误提示颜色不一致，深色背景上对比度不够

#### 问题概述

项目中多处使用内联样式定义错误/降级提示，颜色不统一且部分对比度不足。

**证据**：
| 位置 | 颜色 | 用途 |
|------|------|------|
| `page.tsx:36` | `#f87171` (red-400) | 主页降级提示 |
| `chat/page.tsx:55` | `#f87171` | 聊天页降级 Banner |
| `login/page.tsx:145` | `#f87171` | 登录错误文字 |
| `npc-dialog.tsx:159` | `#fbbf24` (amber-400) | 离线模式标签 |
| `world-shell.tsx:404` | `#4ade80` (green-400) / `#fbbf24` | 任务状态 |

`#f87171` 在 `rgba(0,0,0,0.8)` 深色背景上对比度约 3.2:1，**低于 WCAG AA 标准的 4.5:1**。

#### 市场方案对比

| 维度 | GitHub Primer | Linear | 当前项目 |
|------|---------------|--------|----------|
| 色彩系统 | 语义化 token（fg.danger/fg.warning/fg.success） | 语义化 token | **硬编码 hex** |
| 对比度 | 全部满足 WCAG AA（4.5:1） | 全部满足 WCAG AA | **部分不达标** |
| 深色模式 | 专门的 dark 色值 | 专门的 dark 色值 | 无暗色变体 |
| 错误分级 | danger（红）/warning（黄）/success（绿） | 同左 | 混用红/黄无明确语义 |

**关键洞察**：
- GitHub Primer 使用语义化色彩 token（如 `fgColor-danger`），在深色/浅色模式下自动切换色值
- 错误提示应区分严重性：danger（操作失败）、warning（降级/部分不可用）、success（成功）

#### 推荐方案

**步骤 1：定义语义化色彩 token 常量**

在 `apps/web/src/lib/theme.ts` 中定义统一的色彩系统：

```ts
export const SEMANTIC_COLORS = {
  danger: { light: "#dc2626", dark: "#fca5a5" },    // red-600 / red-300
  warning: { light: "#d97706", dark: "#fcd34d" },   // amber-600 / amber-300
  success: { light: "#16a34a", dark: "#86efac" },   // green-600 / green-300
  info: { light: "#2563eb", dark: "#93c5fd" },      // blue-600 / blue-300
} as const;
```

**步骤 2：降级提示统一使用 warning 色（amber），操作失败使用 danger 色（red）**

- 降级/部分不可用 → warning（amber-300 `#fcd34d`，深色背景对比度 5.6:1 ✓）
- 操作失败/认证错误 → danger（red-300 `#fca5a5`，深色背景对比度 4.8:1 ✓）

**步骤 3：创建 `<StatusNotice>` 组件统一所有提示样式**

接收 `variant: "danger" | "warning" | "success" | "info"` 和 `message`，内部使用语义色 token。

#### 验收标准

1. 所有错误/降级/成功提示使用统一的 `<StatusNotice>` 组件
2. 深色背景下所有文字对比度 ≥ 4.5:1（WCAG AA）
3. 降级提示统一使用 warning（amber）色，操作失败使用 danger（red）色
4. 无硬编码 hex 颜色值散落在组件内联样式中

---

### B-8. 登录页面样式冲突（borderColor vs border）

#### 问题概述

`login/page.tsx` 中 `inputBaseStyle` 使用 `border` 简写属性设置边框，而 `inputFocusStyle` 和 `inputErrorStyle` 仅设置 `borderColor`。React 内联样式的合并逻辑导致 `border` 和 `borderColor` 同时存在时，浏览器行为可能不一致。此外，错误状态的边框颜色仅在非聚焦时显示，切换时视觉不连贯。

**证据**：
- `login/page.tsx:87`：`border: "1px solid rgba(255, 255, 255, 0.15)"`
- `login/page.tsx:96`：`borderColor: "#6366f1"`（focus）
- `login/page.tsx:101`：`borderColor: "#ef4444"`（error）
- `login/page.tsx:200-207`：合并逻辑 `...(hasError && focusedField !== field ? inputErrorStyle : {})` — 错误样式仅在非聚焦字段生效

#### 市场方案对比

| 维度 | Notion | Linear | GitHub Primer | 当前项目 |
|------|--------|--------|---------------|----------|
| 边框样式管理 | CSS class + CSS variable | CSS-in-JS + 状态变体 | 组件 props (variant/contrast) | **内联 style 合并** |
| 状态切换 | :focus / :invalid 伪类 | 状态 prop 驱动 | 为每个组件提供 focus/error 变体 | JS 条件合并 |
| 一致性 | 设计系统统一管理 | 设计系统统一管理 | Primer 组件库 | 独立硬编码 |

**关键洞察**：
- 成熟产品使用 CSS class 或设计系统组件管理输入框状态，而非内联 style 合并
- `border` 简写会重置所有 border 子属性，与 `borderColor` 叠加时依赖 CSS 层叠规则，行为不够直观

#### 推荐方案

**步骤 1：统一使用 `borderColor` 控制颜色**

将 `inputBaseStyle` 中的 `border` 拆分为独立属性：

```ts
const inputBaseStyle: CSSProperties = {
  // ...
  borderWidth: "1px",
  borderStyle: "solid",
  borderColor: "rgba(255, 255, 255, 0.15)",
};
```

这样 `inputFocusStyle` 和 `inputErrorStyle` 的 `borderColor` 可以干净地覆盖。

**步骤 2：修复错误 + 聚焦同时存在的场景**

当字段有错误且获得焦点时，应显示 focus 样式（紫色边框 + 红色阴影），而非忽略错误。修改合并逻辑：

```ts
function getInputStyle(field: "email" | "password"): CSSProperties {
  const hasError = errorMessage !== null;
  return {
    ...inputBaseStyle,
    ...(focusedField === field
      ? inputFocusStyle
      : hasError
        ? inputErrorStyle
        : {}),
  };
}
```

**步骤 3：提取可复用的 Input 组件**

将登录页的输入框样式提取为 `<TextInput>` 组件，支持 `error` 和 `focused` 状态，供全项目复用。

#### 验收标准

1. 输入框在 normal/focus/error/focus+error 四种状态下边框颜色正确显示
2. 聚焦错误字段时显示紫色边框（focus 优先），失焦后显示红色边框（error）
3. 无 `border` 和 `borderColor` 冲突
4. 输入框样式可通过 `<TextInput>` 组件复用

---

### B-9. 教师访问主页 / 未重定向到 /teacher

#### 问题概述

`middleware.ts` 仅检查 token 存在性，不区分用户角色。教师登录后直接访问 `/` 会进入学生主页（WorldShell），而非教师工作台 `/teacher`。登录页虽有角色跳转逻辑，但直接 URL 访问或刷新主页时不会重定向。

**证据**：
- `middleware.ts:4-22`：仅检查 `token` 是否存在，不检查角色
- `login/page.tsx:192`：`router.push(session.user.role === "teacher" ? "/teacher" : "/")` — 仅登录时跳转
- `page.tsx`（主页）：不检查 session 角色，对所有人渲染 WorldShell
- `teacher/page.tsx:57-67`：检查角色但不重定向，仅显示"无权进入"提示

#### 市场方案对比

| 维度 | GitHub | Linear | Notion | 当前项目 |
|------|--------|--------|--------|----------|
| 角色路由 | 中间件 + 页面双重校验 + 重定向 | 中间件解析角色 + 重定向 | 服务端重定向到工作区 | **仅登录页跳转** |
| 直接 URL 访问 | 重定向到正确页面 | 重定向到正确页面 | 重定向到工作区 | **不重定向** |
| 无权限处理 | 403 页面 + 返回按钮 | 重定向 + toast 提示 | 重定向到有权限页面 | 显示文字提示 |

**关键洞察**：
- GitHub/Linear 的做法是：中间件中解析 token 获取角色，根据角色 + 路径决定是否重定向
- 教师访问学生页面应自动重定向到 `/teacher`，而非显示"无权"提示

#### 推荐方案

**步骤 1：在 middleware 中增加角色感知重定向**

由于 middleware 运行在 Edge Runtime，无法直接调用 API 校验。两种方案：
- **方案 A（推荐）**：在登录时将角色信息存入 cookie（如 `agent-guild-role`），middleware 读取 cookie 进行重定向
- **方案 B**：middleware 仅做 token 存在性检查，角色重定向在各页面的服务端逻辑中完成

采用方案 A：

```ts
export function middleware(request: NextRequest) {
  const token = request.cookies.get(SESSION_TOKEN_COOKIE)?.value;
  const role = request.cookies.get("agent-guild-role")?.value;
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/login") || pathname.startsWith("/_next") || pathname.startsWith("/api")) {
    return NextResponse.next();
  }

  if (!token) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // 角色路由：教师访问主页时重定向到教师工作台
  if (role === "teacher" && pathname === "/") {
    return NextResponse.redirect(new URL("/teacher", request.url));
  }

  return NextResponse.next();
}
```

**步骤 2：登录时设置角色 cookie**

`saveSession` 中同时设置 `agent-guild-role` cookie（非 HttpOnly，供 middleware 读取）。

**步骤 3：主页服务端增加角色校验**

`page.tsx` 中检查 session 角色，教师访问时 `redirect("/teacher")`：

```ts
const session = await getServerSession();
if (session?.user.role === "teacher") {
  redirect("/teacher");
}
```

#### 验收标准

1. 教师登录后自动跳转到 `/teacher`
2. 教师直接访问 `/` 时被重定向到 `/teacher`
3. 学生访问 `/teacher` 时被重定向到 `/` 或显示无权限提示
4. 角色重定向在 middleware 层完成（快速），页面层做兜底校验

---

### B-10. ChatOverview 类型定义与 API 实际返回不匹配

#### 问题概述

前端 `ChatOverviewPayload` 类型缺少 `roomId`、`viewerRole`、`messages` 字段，但后端 `getRoomPayload` 方法**始终返回这些字段**。`getChatOverview` 调用 `/chat?studentId=xxx` 实际获得的是完整的 `ChatRoomPayload`，但类型标注为 `ChatOverviewPayload`，导致 TypeScript 类型不安全。

**证据**：
- `api-client.ts:106-123`：`ChatOverviewPayload` 不含 `roomId`/`viewerRole`/`messages`
- `api-client.ts:134-138`：`ChatRoomPayload = ChatOverviewPayload & { roomId; viewerRole; messages }`
- `chat.service.ts:126-161`：`getRoomPayload` **始终返回** `roomId`、`viewerRole`、`messages`、`collaborationGuests` 等
- `api-client.ts:372-378`：`getChatOverview` 返回类型标注为 `ChatOverviewPayload`，但实际 API 返回更丰富

#### 市场方案对比

| 维度 | Linear | GitHub | 当前项目 |
|------|--------|--------|----------|
| API 契约 | GraphQL schema 强类型 + codegen | REST OpenAPI spec + codegen | **手写 TS 类型** |
| 类型同步 | 自动从 schema 生成 | 自动从 spec 生成 | 手动维护，易漂移 |
| 端点返回 | 精确匹配 query 字段 | 精确匹配 schema | **过度返回**（一个端点返回多种形状） |

**关键洞察**：
- Linear/GitHub 使用 schema-first 方法，类型从 schema 自动生成，杜绝类型与实现不一致
- 当前项目后端一个端点 `/chat` 服务多种用途（overview + room），返回完整 room payload，但前端类型拆分为两个

#### 推荐方案

**步骤 1：统一类型定义与 API 返回**

两种方案：
- **方案 A**：让 `ChatOverviewPayload` 包含所有实际返回的字段（即与 `ChatRoomPayload` 合并），移除不必要的类型拆分
- **方案 B（推荐）**：后端拆分端点——`GET /chat/overview?studentId=xxx` 返回 overview（不含 messages），`GET /chat/room?roomId=xxx` 返回完整 room payload

采用方案 B，使端点语义清晰：

```
GET /chat/overview?studentId=xxx  → ChatOverviewPayload（不含 messages）
GET /chat/room?roomId=xxx         → ChatRoomPayload（含 messages）
```

**步骤 2：前端更新对应类型和调用**

`getChatOverview` 调用 `/chat/overview`，`getChatRoom` 调用 `/chat/room`，类型精确匹配。

**步骤 3：增加类型一致性测试**

添加测试验证 API 返回的 JSON 结构与 TS 类型定义一致（可用 zod schema 运行时校验）。

#### 验收标准

1. `ChatOverviewPayload` 类型与 `GET /chat/overview` 返回的 JSON 结构完全匹配
2. `ChatRoomPayload` 类型与 `GET /chat/room` 返回的 JSON 结构完全匹配
3. 无 TypeScript 类型错误（`tsc --noEmit` 通过）
4. 端点语义清晰：overview 不含 messages，room 含 messages

---

## 问题组 C：AI Agent 视角（问题 11-16）

### C-11. 教师无法通过 API 查看自己的聊天房间

#### 问题概述

`ChatService.getRoomPayload` 对教师角色强制要求 `roomId` 参数，无 `roomId` 时抛出 `BadRequestException`。教师无法通过 API 获取自己有权访问的聊天房间列表，必须从教师工作台 UI 手动选择学生。

**证据**：
- `chat.service.ts:42-44`：`if (user.role === UserRole.teacher && !requestedRoomId) { throw new BadRequestException("Teacher must specify a room ID"); }`
- 无 `GET /chat/rooms` 或类似端点供教师列出可观察的房间
- `chat/page.tsx:162-172`：教师无 roomId 时显示"请从教师工作台选择学生房间"

#### 市场方案对比

| 维度 | Slack | Discord | GitHub | 当前项目 |
|------|-------|---------|--------|----------|
| 房间列表 | `GET /conversations.list` 返回所有可见频道 | `GET /users/@me/guilds` + channel list | `GET /repos/{repo}/issues` 分页列表 | **无列表端点** |
| 权限过滤 | 服务端按用户权限过滤 | 按 guild membership 过滤 | 按 repo access 过滤 | 要求客户端提供 roomId |
| 分页 | cursor-based pagination | snowflake-based pagination | page/per_page 参数 | — |

**关键洞察**：
- Slack/Discord 都提供"列出我可访问的频道/房间"端点，服务端按权限自动过滤
- 当前项目已有 `GET /rooms/accessible-rooms`（供学生查询授权房间），教师缺少类似端点

#### 推荐方案

**步骤 1：新增 `GET /chat/rooms` 端点供教师列出可观察房间**

在 `chat.controller.ts` 中新增：

```ts
@Get("rooms")
async listRooms(@CurrentUser() user: CurrentUser) {
  return this.chatService.listTeacherRooms(user);
}
```

**步骤 2：在 ChatService 中实现 `listTeacherRooms`**

教师可观察所有学生房间，返回房间摘要列表：

```ts
async listTeacherRooms(user: CurrentUser) {
  if (user.role !== UserRole.teacher) {
    throw new ForbiddenException("Teacher access required");
  }
  const students = await this.prisma.user.findMany({
    where: { role: UserRole.student },
    select: { id: true, displayName: true, isOnline: true }
  });
  return students.map(s => ({
    roomId: `room-chat-${s.id}`,
    studentId: s.id,
    studentName: s.displayName,
    isOnline: s.isOnline,
  }));
}
```

**步骤 3：修改 `getRoomPayload` 教师无 roomId 时的行为**

将"抛出 400"改为"返回房间列表"（或在 `GET /chat` 无参数时返回列表），而非报错。

#### 验收标准

1. 教师调用 `GET /chat/rooms` 返回所有学生房间列表（roomId、studentName、isOnline）
2. 教师调用 `GET /chat`（无参数）不再返回 400，而是返回房间列表或重定向语义
3. 学生调用 `GET /chat/rooms` 返回 403
4. 房间列表包含在线状态，便于教师快速定位活跃学生

---

### C-12. GET /chat 无参数时对教师返回 400 而非房间列表

#### 问题概述

与问题 C-11 同源。`GET /chat` 无参数时，教师收到 `400 Bad Request`，而非有用的房间列表。这违反 REST API 设计原则——GET 请求应返回资源列表或默认资源，而非因缺少查询参数而报错。

**证据**：
- `chat.service.ts:42-44`：教师无 roomId → `BadRequestException`
- `chat.controller.ts:27-34`：`GET /chat` 直接调用 `getRoomPayload`，未处理无参数场景

#### 市场方案对比

| 维度 | GitHub | Slack | REST 最佳实践 | 当前项目 |
|------|--------|-------|---------------|----------|
| 无参数 GET | 返回列表（分页） | 返回频道列表 | 200 + 列表 | **400 错误** |
| 参数缺失 | 返回默认结果 | 返回默认频道 | 200 + 默认 | 400 |
| 错误语义 | 400 用于请求体格式错误 | 400 用于无效参数值 | 400 用于 malformed request | **用于缺少可选参数** |

**关键洞察**：
- REST 规范中，`400 Bad Request` 应用于请求格式错误（如 JSON 解析失败），而非缺少可选查询参数
- 无参数 `GET /collection` 应返回集合列表（200），这是 REST 约定

#### 推荐方案

**步骤 1：修改 `GET /chat` 无参数行为**

- 学生无参数：返回自己的房间（当前行为，保留）
- 教师无参数：返回可观察的房间列表（200，非 400）

```ts
// chat.service.ts
if (user.role === UserRole.teacher && !requestedRoomId && !requestedStudentId) {
  return this.listTeacherRooms(user);  // 返回房间列表而非 400
}
```

**步骤 2：前端教师聊天页无 roomId 时渲染房间列表**

`chat/page.tsx` 中，教师无 roomId 时调用 `GET /chat` 获取房间列表并渲染选择界面，而非显示"请选择"文字。

#### 验收标准

1. 教师调用 `GET /chat`（无参数）返回 200 + 房间列表（非 400）
2. 教师聊天页无 roomId 时显示可观察的房间列表，点击进入对应房间
3. 学生调用 `GET /chat`（无参数）返回自己的房间（当前行为不变）
4. `400` 仅用于请求体格式错误，不用于缺少可选参数

---

### C-13. Agent avatars 中 lastActiveAt 为 epoch 0（1970年）

#### 问题概述

`AgentAvatarService` 在多个场景下将 `lastActiveAt` 设为 `new Date(0).toISOString()`（1970-01-01T00:00:00.000Z），导致前端显示"1970年"或时间计算异常。

**证据**：
- `agent-avatar.service.ts:167`：离线用户 → `lastActiveAt: new Date(0).toISOString()`
- `agent-avatar.service.ts:193-195`：reviewing 状态 → `pendingReview.id ? new Date().toISOString() : new Date(0).toISOString()`（`id` 始终为 truthy，但 `new Date()` 是当前时间而非实际活动时间）
- `agent-avatar.service.ts:232`：默认 idle → `lastActiveAt: new Date(0).toISOString()`
- 相同模式在 `deriveAvatarState`（line 258, 318-320, 366）中重复

#### 市场方案对比

| 维度 | Discord | Slack | 当前项目 |
|------|---------|-------|----------|
| 最后活跃时间 | 精确到用户实际最后操作时间戳 | 精确到最后消息/操作时间 | **epoch 0 占位** |
| 离线显示 | "Last seen 2h ago" | "Active 1d ago" | "1970-01-01" |
| 数据来源 | presence 事件 + heartbeat | 消息/操作时间戳 | **无可靠来源** |

**关键洞察**：
- Discord/Slack 都记录用户最后活跃的精确时间戳，用于显示"最后在线 X 小时前"
- 使用 epoch 0 作为占位符是一种反模式——应使用 null 表示"无数据"，前端据此显示"从未活跃"

#### 推荐方案

**步骤 1：将 `lastActiveAt` 类型改为 `string | null`**

`null` 表示"无活跃记录"，而非 epoch 0。

**步骤 2：使用实际时间戳**

- 离线用户：查询 `user.lastSeenAt` 或最近提交/记忆时间，无则 `null`
- reviewing 状态：使用 `reviewResult.createdAt`（评审创建时间），而非 `new Date()`
- 默认 idle：使用最近提交时间，无则 `null`

```ts
// 离线用户
lastActiveAt: lastSeenAt ? lastSeenAt.toISOString() : null,

// reviewing 状态
lastActiveAt: pendingReview.createdAt.toISOString(),

// 默认 idle
lastActiveAt: null,
```

**步骤 3：前端处理 null 值**

`AgentAvatar.lastActiveAt` 类型改为 `string | null`，前端显示 null 时为"从未活跃"。

#### 验收标准

1. 所有 `lastActiveAt` 值为有效 ISO 时间字符串或 `null`，不再出现 epoch 0
2. 离线用户显示"最后活跃：X 小时前"或"从未活跃"（而非 1970 年）
3. reviewing 状态的 `lastActiveAt` 为评审创建时间（而非当前时间）
4. `AgentAvatar` 类型定义中 `lastActiveAt: string | null`

---

### C-14. GET /world 信息不够丰富，缺少课程进度等上下文

#### 问题概述

`GET /world` 仅返回 `currentDay`、`location`（硬编码 "main_city"）和 `homesteads` 列表，缺少课程进度、任务状态、学生统计、区域信息等上下文，AI Agent 无法从单一端点获取足够的世界状态信息。

**证据**：
- `world.controller.ts:29-38`：返回 `{ currentDay, location: "main_city", homesteads: [...] }`
- 无课程进度、任务完成统计、在线学生数、区域/NPC 信息
- `location` 硬编码为 `"main_city"`，无实际语义

#### 市场方案对比

| 维度 | Duolingo | ClassDojo | 当前项目 |
|------|----------|-----------|----------|
| 世界状态 API | 课程进度 + 连胜天数 + 每日目标 | 班级状态 + 积分榜 + 行为统计 | **仅 currentDay + homesteads** |
| 上下文丰富度 | 进度/成就/下一课/建议 | 班级/学生/积分/通知 | 极简 |
| AI Agent 可用性 | 足够驱动个性化推荐 | 足够驱动班级管理 | **信息不足以做决策** |

**关键洞察**：
- 游戏化教育平台的世界状态 API 应包含足够上下文供 AI Agent 做决策
- 当前 `homesteads` 仅含 ownerId/displayName/isOnline，缺少任务进度、评审状态等

#### 推荐方案

**步骤 1：扩展 `GET /world` 返回内容**

```ts
{
  currentDay: number;
  totalDays: number;
  courseTitle: string;
  location: string;
  onlineStudentCount: number;
  totalStudentCount: number;
  pendingReviewCount: number;
  zones: Array<{ id: string; name: string; npcCount: number; agentCount: number }>;
  homesteads: Array<{
    ownerId: string;
    displayName: string;
    isOnline: boolean;
    lastActiveAt: string | null;
    currentQuestStatus: "open" | "locked" | "completed";
    pendingReviewStatus: "none" | "queued" | "ai_reviewed" | "teacher_decided";
  }>;
  npcs: Array<{ id: string; name: string; zone: string; role: string }>;
}
```

**步骤 2：在 WorldController 中聚合多数据源**

注入 `ChatService`、`AgentAvatarService`、`ReviewResult` 查询，聚合成丰富世界状态。

**步骤 3：增加分页/字段选择**

参考 GitHub API 的字段选择机制，允许客户端通过 `?fields=` 参数指定需要的字段，避免过度返回。

#### 验收标准

1. `GET /world` 返回课程进度（currentDay/totalDays）、在线统计、区域信息
2. 每个 homestead 包含任务进度和评审状态
3. 包含 NPC 列表（id/name/zone/role）
4. 响应时间 < 500ms（聚合查询优化）

---

### C-15. 缺少 NPC 列表端点

#### 问题概述

NPC 定义仅存在于前端 `zone-config.ts` 中，后端无 NPC 列表端点。AI Agent 无法通过 API 获取可交互的 NPC 列表及其元数据，只能通过网页抓取或硬编码方式发现 NPC。

**证据**：
- `zone-config.ts`：NPC 定义在前端，包含 id、name、tooltip、zone、坐标等
- 后端仅有 `GET /npc/:npcId/conversation`（单 NPC 对话），无列表端点
- `npc-conversation.controller.ts`：无 `@Get()` 列表方法

#### 市场方案对比

| 维度 | Duolingo | 游戏 API（通用） | 当前项目 |
|------|----------|------------------|----------|
| NPC 列表 | 角色列表 API（id/name/role/位置） | `GET /npcs` 返回所有 NPC | **无端点** |
| NPC 元数据 | 含对话触发条件/可用性 | 含位置/交互范围/状态 | 仅前端 config |
| AI 可发现性 | API 可枚举所有可交互角色 | API 可枚举 | **不可枚举** |

**关键洞察**：
- 任何需要 AI Agent 与 NPC 交互的系统，都必须提供 NPC 发现机制（列表端点）
- NPC 元数据应由后端管理（单一数据源），前端从 API 获取而非硬编码

#### 推荐方案

**步骤 1：后端新增 NPC 元数据管理**

两种方案：
- **方案 A**：将 NPC 定义迁移到数据库（Npc 表），支持动态管理
- **方案 B（推荐，快速实现）**：后端创建 `npc.config.ts`（与前端 zone-config 同构），作为 NPC 元数据的单一数据源

**步骤 2：新增 `GET /npcs` 端点**

```ts
@Controller("npc")
export class NpcController {
  @Get()
  list(@Query("zone") zone?: string) {
    const npcs = zone ? NPC_CONFIG.filter(n => n.zone === zone) : NPC_CONFIG;
    return npcs.map(n => ({ id: n.id, name: n.name, zone: n.zone, role: n.role }));
  }
}
```

**步骤 3：前端 zone-config 从 API 获取 NPC 数据**

初始化时调用 `GET /npcs` 获取 NPC 列表，替代硬编码的 `ZONE_DEFS.npcs`。

#### 验收标准

1. `GET /npcs` 返回所有 NPC（id/name/zone/role）
2. `GET /npcs?zone=lobby` 返回指定区域的 NPC
3. AI Agent 可通过 API 枚举所有可交互 NPC
4. NPC 元数据由后端统一管理，前端从 API 获取

---

### C-16. 评审状态语义混淆（ai_reviewed 状态已有 finalScore/decision 但仍标 isPendingTeacherDecision）

#### 问题概述

AI 评审完成时（`status` 变为 `ai_reviewed`），`review.processor.ts` 将 `finalScore` 和 `decision` 写入数据库（使用 AI 建议值）。API 返回的 `ReviewQueueItem` 中 `finalScore`/`decision` 非空，但同时 `isPendingTeacherDecision: true`。AI Agent 无法区分 `finalScore` 是"AI 建议分数"还是"教师最终分数"。

**证据**：
- `review.processor.ts:114-127`：AI 评审完成时写入 `finalScore: suggestedScore` 和 `decision`（AI 建议值）
- `reviews.controller.ts:132-141`：教师决定时覆盖 `finalScore` 和 `decision`（教师最终值）
- `reviews.controller.ts:190-192`：`toReviewListItem` 返回 `finalScore: review.finalScore` + `isPendingTeacherDecision: review.status === ReviewStatus.ai_reviewed`
- 结果：`ai_reviewed` 状态下 `finalScore` = AI 建议值，`isPendingTeacherDecision` = true — 语义矛盾

#### 市场方案对比

| 维度 | GitHub PR Review | Linear | 当前项目 |
|------|-----------------|--------|----------|
| AI 建议 vs 最终决定 | 分离：`review_comment`（建议） vs `review_decision`（最终） | 分离：`suggestion` vs `resolution` | **混用 finalScore** |
| 状态语义 | "changes_requested" ≠ "approved" | "needs review" ≠ "done" | ai_reviewed 同时含 final + pending |
| 字段命名 | `suggested_score` vs `final_score` | `estimate` vs `completed` | **finalScore 用于两种含义** |

**关键洞察**：
- GitHub/Linear 严格分离"建议"和"决定"：AI/审阅者的建议与最终决定使用不同字段
- 当前项目将 AI 建议值写入 `finalScore` 字段，与教师最终决定共用同一字段，是语义混淆的根因

#### 推荐方案

**步骤 1：分离 AI 建议字段与教师决定字段**

- `suggestedScore`：AI 建议分数（已有，保留）
- `suggestedDecision`：AI 建议决定（新增，存储 AI 的 approve/adjust/reject 建议）
- `finalScore`：教师最终分数（仅 `teacher_decided` 状态下有值，否则 null）
- `decision`：教师最终决定（仅 `teacher_decided` 状态下有值，否则 null）

**步骤 2：修改 review.processor.ts**

AI 评审完成时不再写入 `finalScore` 和 `decision`，改为写入 `suggestedDecision`：

```ts
data: {
  status: ReviewStatus.ai_reviewed,
  suggestedScore,
  suggestedDecision: decision,  // 新字段：AI 建议
  // finalScore 和 decision 保持 null，仅在教师决定时写入
  rationale,
  aiReviewedAt: new Date()
}
```

**步骤 3：更新 API 返回和类型定义**

`ReviewQueueItem` 增加 `suggestedDecision` 字段，`finalScore` 和 `decision` 仅在 `teacher_decided` 状态下非 null：

```ts
{
  suggestedScore: number | null;       // AI 建议分数
  suggestedDecision: string | null;    // AI 建议决定（新增）
  finalScore: number | null;           // 教师最终分数（仅 teacher_decided）
  decision: string | null;             // 教师最终决定（仅 teacher_decided）
  isPendingTeacherDecision: boolean;   // true = 等待教师决定
}
```

**步骤 4：前端 UI 区分展示**

- `ai_reviewed` 状态：显示"AI 建议：85 分，通过" + "等待教师裁定"按钮
- `teacher_decided` 状态：显示"教师裁定：90 分，通过"

#### 验收标准

1. `ai_reviewed` 状态下 `finalScore` 和 `decision` 为 null（非 AI 建议值）
2. `ai_reviewed` 状态下 `suggestedScore` 和 `suggestedDecision` 携带 AI 建议值
3. `teacher_decided` 状态下 `finalScore` 和 `decision` 携带教师最终值
4. `isPendingTeacherDecision` 语义清晰：true = 等待教师，false = 已裁定
5. AI Agent 可通过 `finalScore` 是否为 null 判断是否已最终裁定

---

## 附录：市场方案参考索引

### 实时系统

| 产品 | 参考要点 | 来源 |
|------|----------|------|
| Discord Gateway | 心跳保活 + RESUME 会话恢复 + 连接状态指示器 | [Discord Gateway Docs](https://docs.discord.com/developers/events/gateway) |
| Slack Socket Mode | WebSocket 实时推送 + HTTP Events API fallback | [Slack Socket Mode Docs](https://docs.slack.dev/apis/events-api/using-socket-mode) |
| Figma Multiplayer | 离线缓冲 + 重连后增量同步 + 状态恢复 | [Figma Blog](https://www.figma.com/blog/how-figmas-multiplayer-technology-works/) |
| Socket.IO | `auth` 选项传递认证 token + middleware 校验 | [Socket.IO Middleware Docs](https://socket.io/docs/v4/middlewares/) |
| Notion | WebSocket 实时同步 + block 级增量更新 | [System Design: Collaborative Editor](https://crackingwalnuts.com/post/collaborative-editor-system-design) |

### UI/UX 体验

| 产品 | 参考要点 | 来源 |
|------|----------|------|
| GitHub Primer | 分级降级策略（primary/secondary）+ Blankslate 组件 + 全局 Banner | [Primer Degraded Experiences](https://primer.style/ui-patterns/degraded-experiences) |
| Linear | 错误状态 UI + 加载状态 + 重试机制 | [Error State Design Patterns](https://figr.design/blog/error-state-design-patterns) |
| Duolingo | 游戏化视觉反馈 + NPC 角色交互 + 进度色彩编码 | [Duolingo Gamification Design](https://blakecrosley.com/guides/design/duolingo) |
| GitHub Toast 决策 | 移除 Toast 消息的可达性考量 | [GitHub Bans Toast Messages](https://javascript.plainenglish.io/github-just-killed-toast-messages-heres-the-accessibility-data-that-forced-their-hand-97235e948227) |
| 错误状态设计 | 10 种错误状态模式（inline/toast/full-page/empty/network/timeout/permission/404/payment/rate-limit） | [Figr Error State Patterns](https://figr.design/blog/error-state-design-patterns) |

### API 设计

| 产品 | 参考要点 | 来源 |
|------|----------|------|
| GitHub REST | `GET /collection` 无参数返回列表 + 分页 + 字段选择 | GitHub REST API Docs |
| Slack | `GET /conversations.list` 按权限过滤 + cursor 分页 | Slack API Docs |
| Linear | GraphQL schema 强类型 + codegen 类型同步 | Linear API Docs |

---

## 实施优先级建议

| 优先级 | 问题编号 | 问题摘要 | 理由 |
|--------|----------|----------|------|
| **P0** | A-1 | WebSocket 未传 Token | 实时功能完全失效，修复成本极低（1 行代码） |
| **P0** | B-5 | API 降级假阳性 | 用户体验严重影响，修复成本低（传 token） |
| **P0** | B-4 | 会话持久化不稳定 | 影响核心导航流程，需架构调整 |
| **P1** | A-3 | 聊天消息推送不通 | 依赖 A-1 修复，需新增客户端 socket |
| **P1** | C-16 | 评审状态语义混淆 | 影响 AI Agent 决策正确性 |
| **P1** | B-9 | 教师未重定向 | 角色路由缺失，影响教师体验 |
| **P2** | A-2 | 评审状态实时推送 | 依赖 A-1 修复，提升体验 |
| **P2** | C-11/12 | 教师房间列表 | API 设计改进 |
| **P2** | B-7 | 错误提示颜色不一致 | 视觉一致性 |
| **P2** | C-13 | lastActiveAt epoch 0 | 数据质量问题 |
| **P3** | B-6 | NPC 交互可访问性 | 需 DOM 叠层方案 |
| **P3** | B-8 | 登录页样式冲突 | 小范围修复 |
| **P3** | B-10 | 类型定义不匹配 | 架构改进 |
| **P3** | C-14 | GET /world 丰富度 | 功能增强 |
| **P3** | C-15 | NPC 列表端点 | 功能增强 |

---

> **文档结束**。本 PRD 基于代码审查 + 市场竞品分析编写，所有推荐方案均标注了具体文件路径和代码位置，可直接作为开发实施依据。
