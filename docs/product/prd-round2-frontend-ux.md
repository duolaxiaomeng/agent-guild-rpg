# PRD：第二轮前端体验与导航系统修复

> **文档状态**：草案 v1.0
> **角色**：产品官 Jack
> **日期**：2026-07-08
> **范围**：44 项 Phase 1 审查问题，分为导航与信息架构、视觉一致性与加载体验、空状态与错误恢复、响应式与可访问性、前端逻辑与 API 集成、NPC 与记忆系统六组

---

## 目录

- [1. 问题概述（按严重程度分组）](#1-问题概述按严重程度分组)
- [2. 市面产品分析](#2-市面产品分析)
- [3. 方案对比](#3-方案对比)
- [4. 推荐方案](#4-推荐方案)
- [5. 原子化实施步骤](#5-原子化实施步骤)
- [附录 A：问题追踪矩阵](#附录-a问题追踪矩阵)
- [附录 B：文件变更清单](#附录-b文件变更清单)

---

## 1. 问题概述（按严重程度分组）

### 1.1 P1 - 阻断性问题（8 项）

| 编号 | 问题 | 涉及文件 | 影响 |
|------|------|----------|------|
| H-002 | 主城区缺少到工会大厅的导航入口 | world-shell.tsx | 学生无法从主城区进入工会大厅 |
| H-003 | 聊天室和工会大厅缺少返回主页导航 | chat/page.tsx, guilds/page.tsx | 用户进入子页面后无返回路径 |
| H-005 | "课程"链接对学生无效，点击后被拒 | world-shell.tsx, teacher/page.tsx | 学生点击"课程"入口遭遇权限拒绝 |
| H-006 | Phaser 游戏加载期间无 loading 占位 | world-shell.tsx, phaser-scene.ts | 首次加载白屏 |
| H-004 | "忘记密码"是死链接 | login/page.tsx | 点击无反应 |
| F-001 | API_BASE_URL 硬编码 localhost | api-client.ts:1 | 生产环境完全不可用 |
| F-002 | Phaser Agent 头像按数组下标匹配而非 studentId | phaser-scene.ts:583 | 状态张冠李戴 |
| R-005 | NPC 对话记忆写入因外键约束失败被静默吞掉 | npc-conversation.service.ts:86-101, schema.prisma:240 | NPC 记忆功能完全失效 |

### 1.2 P2 - 严重问题（18 项）

| 编号 | 问题 | 涉及文件 | 影响 |
|------|------|----------|------|
| H-008 | API 降级提示颜色和文案在各页面不统一 | chat/teacher/guilds/page.tsx | 降级体验不一致 |
| H-010 | 评审队列统计卡片数字与标签无层级区分 | review-queue.tsx:111-115 | 视觉层级不清 |
| H-011 | 多处中英文混用标题（"Day 关卡面板"等） | day-panel.tsx:64 | 不专业 |
| H-017 | 区域切换 300ms 锁定期无视觉反馈 | world-shell.tsx:243 | 用户不知发生了什么 |
| F-005 | 会话横幅每次页面导航先闪烁"未登录" | session-banner.tsx:20-21 | SSR 已认证但客户端首帧显示"未登录" |
| F-009 | 登录错误统一提示"检查邮箱密码"，网络错误误导 | login/page.tsx:195-196 | 网络超时也提示密码错误 |
| F-010 | 教师工作台未认证时不提供登录入口 | teacher/page.tsx:45-55 | 仅显示"请先登录"无跳转 |
| F-013 | "课程"入口对所有用户可见，学生点击遭遇权限拒绝 | world-shell.tsx:304 | 学生看到入口但无法使用 |
| F-012 | WebSocket URL 硬编码端口 3001 | world-shell.tsx:28 | 生产环境 WebSocket 连接失败 |
| F-014 | NPC 对话未传递 studentId | world-shell.tsx:439-444 | NPC 无法个性化对话 |
| F-018 | fetchAgentAvatarsSafe 未传递 token | api-client.ts:483-492 | 可能返回不完整数据 |
| F-019 | toTimeLabel 不转换时区 | format.ts:1-3 | UTC 时间直接显示 |
| H-009 | 网络错误时显示"未登录"造成用户困惑 | session-banner.tsx:44-49 | API 不可达时 session 被清除 |
| H-012 | 工会空状态提示"创建或加入"但无操作入口 | guild-panel.tsx:95 | 空状态文字引导但无按钮 |
| H-013 | 移动端浮动按钮和 tab 栏重叠 | world-shell.tsx:249-357 | 底部按钮与内容重叠 |
| H-014 | NPC 对话框焦点管理不完整，无 focus trap | npc-dialog.tsx:95-101 | 键盘用户可 Tab 到对话框外 |
| H-015 | 低透明度文字不满足 WCAG AA 对比度标准 | 多文件 | 对比度不足 |
| H-016 | Phaser Canvas 内容对屏幕阅读器完全不可达 | phaser-scene.ts | 视障用户无法获取地图信息 |

### 1.3 P3 - 优化项（18 项）

| 编号 | 问题 | 涉及文件 |
|------|------|----------|
| H-022 | SessionBanner 无导航/退出功能 | session-banner.tsx |
| H-018 | 按钮 hover 依赖 JS state，移动端无效 | login/page.tsx:286-287 |
| H-019 | 展开的 InsightPanel 可能遮挡工具栏按钮 | insight-panel.tsx:56-69 |
| H-020 | 引用 "Press Start 2P" 字体但未加载 | phaser-scene.ts:714, layout.tsx |
| H-021 | 双重 minHeight 和背景样式冗余 | guild-panel.tsx:16-17, guilds/page.tsx:13-16 |
| H-023 | 消息列表固定 maxHeight 400px 不适配 | room-messages.tsx:40 |
| H-024 | tab 栏缺少 aria-controls 和键盘方向键导航 | world-shell.tsx:249-290 |
| H-025 | logo 的 aria 标签使用不规范 | login/page.tsx:226 |
| F-006 | 服务端会话判定依赖脆弱的字符串匹配 | server-session.ts:34-35 |
| F-020 | 聊天提交内容使用英文硬编码 | chat-room.tsx:229 |
| F-021 | GuildPanel "活跃"徽章硬编码 | guild-panel.tsx:101 |
| F-022 | NPC dialog reply state 为死代码 | npc-dialog.tsx:29 |
| F-023 | EMPTY_SOP_RESULT 时间戳在模块加载时固定 | api-client.ts:688 |
| F-024 | SessionBanner 每次挂载重新保存 session | session-banner.tsx:37 |
| F-026 | completed 和 open 任务均标记为"活跃" | world-shell.tsx:386 |
| F-027 | 串行 API 调用可并行化 | chat/page.tsx:192-199 |
| F-028 | 列表渲染使用数组索引作为 key | npc-dialog.tsx:194, insight-panel.tsx:158 |
| F-029 | 聊天页未认证提示"学生账号"但教师也可访问 | chat/page.tsx:137 |
| F-030 | owner 视角"进入房间"链接无意义 | chat/page.tsx:252 |
| R-037 | lastActiveAt 使用当前时间而非实际评审时间 | agent-avatar.service.ts:193-194 |

---

## 2. 市面产品分析

### 2.1 导航与信息架构（H-002, H-003, H-005, H-022, F-010, F-013, F-029, F-030）

**问题本质**：应用缺少统一的导航骨架。主城区（游戏视图）与子页面（聊天、工会、教师工作台）之间没有双向导航通路；角色权限边界未在导航层体现。

**Duolingo 的做法**：
- 采用底部 tab 栏作为全局导航锚点，所有页面共享同一 tab 栏
- 超出当前等级/权限的入口显示为"锁定"状态而非隐藏，点击后弹出说明（如"完成第 3 课解锁"），而非直接拒绝
- 每个页面顶部有返回箭头，确保用户始终有路径回退

**Notion 的做法**：
- 左侧 sidebar 提供全局导航，可在任何页面通过 Cmd+/ 快速跳转
- 权限不足的页面显示"您没有访问权限"并提供"请求访问"按钮，而非死胡同
- 面包屑导航始终可见，显示当前页面的层级路径

**Linear 的做法**：
- 命令面板（Cmd+K）作为全局导航枢纽，用户可在任何页面快速跳转
- 角色权限在导航层过滤：普通成员看不到 Admin 设置入口
- 每个详情页都有面包屑返回上级视图

**Khan Academy 的做法**：
- 学生侧边栏仅显示学生可访问的功能，教师入口对隐藏
- 教师角色切换后导航栏自动更新，显示教师专属入口
- 每个学习页面都有"返回课程地图"的固定按钮

**Codecademy 的做法**：
- 顶部导航栏始终可见，包含 Logo（返回首页）、课程目录、个人资料
- 权限不足的页面重定向到登录页，而非显示拒绝信息
- 学习路径中的下一步导航始终可见，避免死胡同

### 2.2 视觉一致性与加载体验（H-006, H-008, H-010, H-011, H-017, H-020, H-021, F-005, F-009）

**问题本质**：加载状态缺失、降级提示样式碎片化、中英文混用、字体未加载、会话横幅闪烁。

**Figma 的做法**：
- Canvas 加载期间显示骨架占位（灰色矩形模拟最终布局），而非白屏
- 所有提示统一使用 Toast 组件系统，颜色/图标/文案有设计 token 约束
- 多语言场景下标题完全本地化，不混用

**Vercel Dashboard 的做法**：
- 页面加载使用 skeleton screen 模拟内容布局
- 所有降级/错误状态使用统一的 Banner 组件（分 info/warning/error 三级）
- 数据卡片采用数字大字号 + 标签小字号的层级结构

**Stripe Dashboard 的做法**：
- 统计卡片中数字使用 32px 粗体，标签使用 12px 常规，形成清晰视觉层级
- 所有错误提示通过统一 Toast 系统，按网络/认证/权限分类显示不同文案
- 页面切换使用骨架屏 + 200ms 过渡动画，避免感知闪烁

**Linear 的做法**：
- 页面导航时显示骨架屏，不会闪烁"空"状态
- 所有加载/错误状态使用统一的 inline notice 组件
- 交互锁定期显示半透明遮罩 + spinner

### 2.3 空状态与错误恢复（H-004, H-009, H-012, F-006, F-023）

**问题本质**：空状态无操作出口、网络错误与认证错误混淆、死链接、脆弱的错误判定逻辑。

**Duolingo 的做法**：
- 空状态页面配有插画 + 明确 CTA 按钮（如"开始第一课"），而非纯文字
- 网络错误时显示"连接中断"提示 + 重试按钮，不会清除登录状态
- "忘记密码"链接到实际的密码重置流程

**Notion 的做法**：
- 空状态页面有明确的创建按钮和引导文案
- 网络错误时保留页面内容，顶部显示"离线模式"横幅
- 错误判定基于 HTTP 状态码而非错误消息字符串

**Vercel Dashboard 的做法**：
- 空状态显示引导性插画 + "创建项目"按钮
- API 错误时显示具体错误类型（网络/认证/服务器），而非统一文案
- 降级时间戳在每次降级时实时生成，不使用模块级常量

### 2.4 响应式与可访问性（H-013 ~ H-016, H-018 ~ H-025, H-023）

**问题本质**：移动端布局冲突、focus trap 缺失、对比度不足、Canvas 不可达、键盘导航不完整、aria 标签不规范。

**Linear 的做法**：
- 移动端浮动操作按钮使用 safe-area-inset 避开系统手势区域
- Modal 对话框实现完整 focus trap：Tab 循环、Escape 关闭、焦点恢复
- 所有文字颜色通过设计 token 系统管理，确保 WCAG AA 合规

**Notion 的做法**：
- 可访问性优先：所有交互元素支持键盘操作，tab 顺序合理
- Canvas 类内容提供文本替代描述
- 所有图标按钮都有 aria-label

**Figma 的做法**：
- 设计文件 Canvas 提供文本描述层（通过 aria-live 区域）
- 颜色对比度在设计系统中强制检查
- 响应式断点：移动端使用底部 FAB + 抽屉导航，桌面端使用侧边栏

### 2.5 前端逻辑与 API 集成（F-001, F-002, F-012 ~ F-022, F-024, F-026 ~ F-030）

**问题本质**：硬编码 URL/端口、数组下标匹配 avatar、token 未传递、时区未转换、硬编码文案/状态。

**Vercel Dashboard 的做法**：
- API base URL 通过 NEXT_PUBLIC_API_URL 环境变量注入，开发/生产自动切换
- WebSocket URL 从同源推导，不硬编码端口
- 所有 API 调用统一通过 auth middleware 注入 token

**Stripe Dashboard 的做法**：
- 所有时间显示通过统一的 formatDate 工具函数，自动转换用户时区
- 所有用户可见文案通过 i18n 系统，不硬编码
- 状态判定基于结构化数据（status 字段），不基于字符串匹配

### 2.6 NPC 与记忆系统（R-005, R-037）

**问题本质**：NPC 记忆写入因外键约束失败被静默吞掉；lastActiveAt 使用当前时间而非实际时间。

**Duolingo（Character 系统）的做法**：
- NPC 对话历史存储在独立的 character_interactions 表中，不与用户表外键绑定
- NPC 角色 ID 使用专门的命名空间前缀，在数据库层通过 sourceType 区分

**Codecademy（AI Tutor）的做法**：
- AI Tutor 对话记忆存储在独立的 tutor_sessions 表中，通过 session_type 区分 NPC 与学生
- 时间戳在事件发生时记录，不使用 new Date() 实时生成

---

## 3. 方案对比

### 3.1 导航架构方案对比

| 方案 | 描述 | 优点 | 缺点 | 适用场景 |
|------|------|------|------|----------|
| A. 全局顶栏导航 | 所有页面共享顶部导航栏 | 统一性好 | 与 Phaser Canvas 冲突 | 纯 Web 应用 |
| B. 浮动导航胶囊 | Phaser Canvas 上叠加半透明浮动导航，子页面用面包屑 | 不破坏沉浸式体验 | 发现性略低 | **本项目推荐** |
| C. 命令面板 (Cmd+K) | 全局快捷键打开导航面板 | 高效 | 学习成本高 | 高频用户工具 |

**推荐方案 B**：与现有 Phaser 浮动按钮风格一致，在主城区增加工会入口胶囊；子页面增加面包屑返回链接。同时按角色过滤导航入口可见性。

### 3.2 加载状态方案对比

| 方案 | 描述 | 优点 | 缺点 |
|------|------|------|------|
| A. Spinner 居中 | 旋转加载图标 | 实现简单 | 无信息量 |
| B. 骨架屏 | 灰色占位模拟最终布局 | 感知性能好 | 实现成本中等 |
| C. 渐进式加载 | 先显示静态元素再填充 | 最佳感知性能 | 实现复杂 |

**推荐方案 B**：Phaser 加载期间显示像素风骨架屏（灰色矩形 + "世界加载中..."文案）。

### 3.3 会话横幅方案对比

| 方案 | 描述 | 优点 | 缺点 |
|------|------|------|------|
| A. SSR 直传 session | 服务端渲染时直接传入 session | 无闪烁 | 需改动组件签名 |
| B. 初始隐藏 + 淡入 | 首帧隐藏横幅，校验后淡入 | 实现简单 | 短暂空白 |
| C. SSR 直传 + 客户端校验 | 服务端传入 session 作为 initial state | 无闪烁且安全 | 需传递 prop |

**推荐方案 C**：服务端 getServerSession() 结果传入 SessionBanner 作为 initialSession prop。

### 3.4 NPC 记忆外键方案对比

| 方案 | 描述 | 优点 | 缺点 |
|------|------|------|------|
| A. 放宽外键约束 | 移除 AgentMemory.studentId 外键 | 最小改动 | 数据完整性降低 |
| B. NPC 虚拟用户 | 为每个 NPC 在 User 表创建虚拟记录 | 外键完整 | 污染用户表 |
| C. 独立 NPC 记忆表 | 新建 NpcMemory 表 | 架构清晰 | 需新建表+迁移 |
| D. sourceType 隔离 | 保留外键但 NPC 写独立表 | 最灵活 | 查询复杂 |

**推荐方案 C**：新建 NpcMemory 表，结构与 AgentMemory 类似但 npcId 为主键。

### 3.5 API 配置方案对比

| 方案 | 描述 | 优点 | 缺点 |
|------|------|------|------|
| A. 环境变量 | NEXT_PUBLIC_API_URL 注入 | 标准做法 | 需配置 .env |
| B. 同源推导 | API base = origin + /api | 零配置 | 需反向代理 |
| C. 环境变量 + 同源 fallback | 优先环境变量，未配置时从 origin 推导 | 灵活 | 逻辑稍复杂 |

**推荐方案 C**：API_BASE_URL 优先读环境变量，未配置时从 window.location.origin 推导。

---

## 4. 推荐方案

### 4.1 导航与信息架构

1. **主城区增加工会入口**：在 world-shell.tsx 底部浮动按钮区域增加"工会大厅"入口胶囊
2. **子页面增加面包屑**：聊天页和工会页顶部增加"返回主城区"链接
3. **角色过滤导航入口**："课程"入口仅对教师可见；学生侧增加"学习进度"入口
4. **SessionBanner 升级为导航组件**：增加用户名 + 下拉菜单（含返回主页、退出登录）
5. **未认证页面增加登录入口**：所有未认证提示页面增加"去登录"按钮

### 4.2 视觉一致性与加载体验

1. **Phaser 加载骨架屏**：增加 isLoading 状态，加载期间显示像素风骨架
2. **统一降级提示组件**：抽取 DegradedBanner 共享组件
3. **统计卡片层级化**：数字 32px 粗体，标签 12px 常规
4. **全中文标题**：将"Day 关卡面板"改为"关卡进度"
5. **区域切换视觉反馈**：300ms 锁定期内显示半透明遮罩
6. **加载 Press Start 2P 字体**：通过 next/font 加载
7. **SSR 直传 session 消除闪烁**：服务端传入 session 作为初始状态
8. **登录错误分类提示**：网络错误和认证错误显示不同文案

### 4.3 空状态与错误恢复

1. **忘记密码改为 toast 提示**："密码重置功能即将上线"
2. **空状态增加 CTA 按钮**：工会空状态增加"联系老师创建工会"按钮
3. **错误判定改用 HTTP 状态码**：用 response.status 判定
4. **EMPTY_SOP_RESULT 时间戳改为函数**：每次降级时生成新时间戳

### 4.4 响应式与可访问性

1. **移动端浮动按钮避让**：使用 env(safe-area-inset-bottom)
2. **NPC 对话框 focus trap**：Tab 键循环锁定在对话框内
3. **对比度修复**：所有 rgba(255,255,255,0.3) 提升至 0.6 以上
4. **Canvas 文本替代**：增加 aria-describedby 隐藏文本
5. **tab 栏键盘导航**：增加 aria-controls + 方向键切换
6. **aria 标签修复**：logo 使用 aria-hidden
7. **hover 效果 CSS 化**：用 CSS :hover 替代 JS state
8. **消息列表自适应高度**：maxHeight 改为 min(60vh, 600px)

### 4.5 前端逻辑与 API 集成

1. **API_BASE_URL 环境变量化**：process.env.NEXT_PUBLIC_API_URL + 同源 fallback
2. **Avatar 按 studentId 匹配**：find() 替代下标访问
3. **WebSocket URL 动态推导**：从 window.location.origin 推导
4. **NPC 对话传递 studentId**：NpcDialog 接收并传递 prop
5. **fetchAgentAvatarsSafe 支持 token**：增加可选 token 参数
6. **toTimeLabel 时区转换**：使用 toLocaleString
7. **硬编码文案中文化**
8. **死代码清理与 key 修复**

### 4.6 NPC 与记忆系统

1. **新建 NpcMemory 表**：解决外键约束问题
2. **lastActiveAt 使用实际时间**：使用 pendingReview.createdAt

---

## 5. 原子化实施步骤

> 每个步骤可独立执行和验证。步骤编号 S-XX，按优先级和依赖关系排列。

### 第一批：P1 导航与信息架构（S-01 ~ S-05）

---

#### S-01：主城区增加工会大厅导航入口

**问题编号**：H-002 (P1)

**涉及文件**：`apps/web/src/components/world/world-shell.tsx`

**具体改动**：在底部浮动按钮区域（约第 312-333 行），在"世界频道"按钮旁增加"工会大厅"链接：
```tsx
<Link href="/guilds" style={{ position: "absolute", bottom: 24, left: 120, zIndex: 10, ...floatBtn }}>
  工会大厅
</Link>
```

**验证方法**：
1. 登录学生账号，进入主城区，确认底部出现"工会大厅"浮动按钮
2. 点击按钮，确认跳转到 `/guilds` 页面
3. 在 375px 宽度视口确认按钮不重叠

**依赖**：无

---

#### S-02：聊天室和工会大厅增加返回主页导航

**问题编号**：H-003 (P1)

**涉及文件**：`apps/web/src/app/chat/page.tsx`, `apps/web/src/app/guilds/page.tsx`

**具体改动**：在页面标题区域增加"返回主城区"链接，与 `teacher/page.tsx` 第 109-118 行模式一致：
```tsx
<Link href="/" style={{ fontSize: "13px", color: "rgba(255,255,255,0.4)", textDecoration: "none" }}>
  返回主城区
</Link>
```
在 `chat/page.tsx` 的每个 return 分支的 `<h1>` 后都增加此链接。

**验证方法**：
1. 从主城区进入聊天页，确认顶部有"返回主城区"链接
2. 点击链接，确认返回主城区
3. 在降级页面也确认返回链接存在

**依赖**：无

---

#### S-03：按角色过滤"课程"入口

**问题编号**：H-005, F-013 (P1/P2)

**涉及文件**：`apps/web/src/components/world/world-shell.tsx`, `apps/web/src/app/page.tsx`

**具体改动**：
1. 在 `page.tsx` 中将 session 结果传入 `WorldShell`：
```tsx
<WorldShell userRole={result.status === "authenticated" ? result.session.user.role : undefined} />
```
2. 在 `WorldShell` 中接收 `userRole` prop，根据角色渲染不同入口：
   - 教师：显示"课程"链接指向 `/teacher`
   - 学生：显示"学习进度"链接指向 `/chat`
   - 未登录：不显示

**验证方法**：
1. 学生登录后确认顶部右侧显示"学习进度"而非"课程"
2. 点击"学习进度"，确认跳转到 `/chat` 且无权限拒绝
3. 教师登录后确认显示"课程"

**依赖**：无

---

#### S-04：SessionBanner 升级为导航组件

**问题编号**：H-022 (P3，关联 H-003)

**涉及文件**：`apps/web/src/components/auth/session-banner.tsx`

**具体改动**：增加"主页"链接和"退出"按钮：
```tsx
{session ? (
  <>
    <Link href="/" style={navLinkStyle}>主页</Link>
    <button onClick={handleLogout} style={navLinkStyle}>退出</button>
  </>
) : (
  <Link href="/login" style={navLinkStyle}>去登录</Link>
)}
```

**验证方法**：
1. 在子页面点击 SessionBanner 中"主页"链接，确认返回主城区
2. 点击"退出"确认跳转登录页
3. 未登录确认显示"去登录"链接

**依赖**：S-07

---

#### S-05：未认证页面增加登录入口

**问题编号**：F-010 (P2)

**涉及文件**：`apps/web/src/app/teacher/page.tsx`, `apps/web/src/app/chat/page.tsx`, `apps/web/src/app/guilds/page.tsx`

**具体改动**：在未认证提示文案旁增加"去登录"链接按钮：
```tsx
<p>请先登录老师账号。</p>
<Link href="/login" style={loginLinkStyle}>去登录</Link>
```

**验证方法**：
1. 退出登录后访问 `/teacher`，确认显示"去登录"链接
2. 点击链接确认跳转到登录页

**依赖**：无

---

### 第二批：P1 视觉与加载（S-06 ~ S-09）

---

#### S-06：Phaser 游戏加载期间显示骨架屏

**问题编号**：H-006 (P1)

**涉及文件**：`apps/web/src/components/world/world-shell.tsx`

**具体改动**：
1. 增加 `isGameLoading` 状态
2. 在 `bootWorld()` 完成后设置 `setIsGameLoading(false)`
3. 在 Phaser mount div 上方渲染骨架屏覆盖层

**验证方法**：
1. 清除缓存后首次访问主城区，确认加载期间显示"世界加载中..."骨架屏
2. 确认 Phaser 加载完成后骨架屏消失

**依赖**：无

---

#### S-07：SSR 直传 session 消除 SessionBanner 闪烁

**问题编号**：F-005 (P2)

**涉及文件**：`apps/web/src/components/auth/session-banner.tsx` 及所有页面组件

**具体改动**：
1. `SessionBanner` 增加可选 `initialSession` prop
2. 初始 state 使用 `initialSession` 而非 null
3. 所有页面传入 `initialSession={result.status === "authenticated" ? result.session : null}`

**验证方法**：
1. 登录后刷新主城区，确认 SessionBanner 首帧即显示用户名，无闪烁
2. 在所有页面分别验证无闪烁

**依赖**：无

---

#### S-08：忘记密码改为有效提示

**问题编号**：H-004 (P1)

**涉及文件**：`apps/web/src/app/login/page.tsx`

**具体改动**：将死链接改为点击后显示 toast 提示：
```tsx
onClick={(e) => { e.preventDefault(); setForgotToast(true); setTimeout(() => setForgotToast(false), 4000); }}
```

**验证方法**：
1. 点击"忘记密码？"，确认显示"密码重置功能即将上线"提示
2. 确认 4 秒后提示消失

**依赖**：无

---

#### S-09：API_BASE_URL 环境变量化

**问题编号**：F-001 (P1)

**涉及文件**：`apps/web/src/lib/api-client.ts`

**具体改动**：将第 1 行硬编码改为：
```tsx
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? (typeof window !== "undefined" ? `${window.location.origin}/api` : "http://localhost:3001");
```

**验证方法**：
1. 设置 `NEXT_PUBLIC_API_URL` 后确认 API 请求指向该地址
2. 生产部署后确认不再指向 localhost

**依赖**：无

---

### 第三批：P1 空状态与逻辑（S-10 ~ S-12）

---

#### S-10：Avatar 按 studentId 匹配替代数组下标

**问题编号**：F-002 (P1)

**涉及文件**：`apps/web/src/components/world/phaser-scene.ts`

**具体改动**：将第 583 行 `const avatar = avatars?.[i]` 改为：
```tsx
const avatar = avatars?.find((a) => a.studentId === agent.id);
```

**验证方法**：
1. 模拟 avatars 数组乱序返回，确认每个 agent 匹配正确状态
2. 确认 offline 状态 agent 正确跳过

**依赖**：需确认后端 agent-avatars API 的 studentId 字段与 zone-config.ts 中 agent.id 对应

---

#### S-11：NPC 对话记忆写入修复（新建 NpcMemory 表）

**问题编号**：R-005 (P1)

**涉及文件**：`apps/api/prisma/schema.prisma`, `apps/api/src/modules/memory/memory.service.ts`, `apps/api/src/modules/memory/npc-conversation.service.ts`

**具体改动**：
1. 在 `schema.prisma` 中新建 `NpcMemory` 模型（无外键约束到 User）
2. 在 `MemoryService` 中增加 `observeNpc` 和 `retrieveNpc` 方法
3. 在 `NpcConversationService` 中改用 `observeNpc` 替代 `observe(npcStudentId, ...)`
4. 运行 `npx prisma migrate dev --name add-npc-memory`

**证据**：`schema.prisma:240` 中 `AgentMemory` 有 `student User @relation(fields: [studentId], references: [id])` 外键约束，而 `npc-conversation.service.ts:88` 使用 `npcStudentId = "npc:${npcId}"` 不存在于 User 表，导致外键约束失败被 catch 块静默吞掉。

**验证方法**：
1. 与 NPC 对话后确认 `NpcMemory` 表有记录
2. 再次对话确认 LLM 上下文包含历史记忆
3. 确认控制台无外键约束错误

**依赖**：需要数据库迁移

---

#### S-12：WebSocket URL 动态推导

**问题编号**：F-012 (P2)

**涉及文件**：`apps/web/src/components/world/world-shell.tsx`

**具体改动**：修改 `getWsUrl()` 函数（第 26-31 行），从环境变量或同源推导：
```tsx
function getWsUrl(): string {
  if (typeof window !== "undefined") {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL;
    if (apiUrl) return apiUrl.replace(/^http/, "ws");
    return window.location.origin;
  }
  return "http://localhost:3001";
}
```

**验证方法**：
1. 生产部署后确认 WebSocket 不再指向 localhost:3001
2. 设置环境变量后确认 WS URL 随之改变

**依赖**：S-09

---

### 第四批：P2 视觉一致性与加载（S-13 ~ S-20）

---

#### S-13：统一 API 降级提示组件

**问题编号**：H-008 (P2)

**涉及文件**：新建 `apps/web/src/components/shared/degraded-banner.tsx`；修改 `chat/page.tsx`, `teacher/page.tsx`, `guilds/page.tsx`, `page.tsx`

**具体改动**：新建 `DegradedBanner` 共享组件，统一黄色警告样式（与 teacher/page.tsx 现有样式一致），替换各页面内联样式。

**验证方法**：确认各页面降级提示样式一致。

**依赖**：无

---

#### S-14：评审队列统计卡片数字与标签层级化

**问题编号**：H-010 (P2)

**涉及文件**：`apps/web/src/components/teacher/review-queue.tsx`

**具体改动**：将 `summaryCards` 的 `text` 字段拆分为 `label` 和 `value`，渲染时数字 32px 粗体、标签 12px 常规。

**验证方法**：确认统计卡片视觉层级清晰。

**依赖**：无

---

#### S-15：中英文混用标题全中文化

**问题编号**：H-011 (P2)

**涉及文件**：`apps/web/src/components/quests/day-panel.tsx`, `apps/web/src/app/chat/page.tsx`, `apps/web/src/components/chat/chat-room.tsx`

**具体改动**：
- `day-panel.tsx:64`：`"Day 关卡面板"` → `"关卡进度"`
- `chat/page.tsx:181` 和 `chat-room.tsx:198`：`"Teacher 观察"` → `"教师观察"`

**验证方法**：确认全站无中英文混用标题。

**依赖**：无

---

#### S-16：区域切换 300ms 锁定期增加视觉反馈

**问题编号**：H-017 (P2)

**涉及文件**：`apps/web/src/components/world/world-shell.tsx`

**具体改动**：在 `isSwitching` 为 true 时显示半透明遮罩（pointerEvents: none）。

**验证方法**：切换区域时确认有遮罩反馈。

**依赖**：无

---

#### S-17：加载 Press Start 2P 字体

**问题编号**：H-020 (P3)

**涉及文件**：`apps/web/src/app/layout.tsx`

**具体改动**：通过 `next/font/google` 加载 Press Start 2P 字体，仅用于 Phaser badge 数字。

**验证方法**：确认 Phaser badge 数字使用该字体渲染。

**依赖**：无

---

#### S-18：消除双重 minHeight 和背景样式冗余

**问题编号**：H-021 (P3)

**涉及文件**：`apps/web/src/components/guild/guild-panel.tsx`

**具体改动**：移除 `sectionStyle` 中 `minHeight` 和 `background`（父级已设置）。

**验证方法**：确认工会页面背景不受影响。

**依赖**：无

---

#### S-19：登录错误分类提示

**问题编号**：F-009 (P2)

**涉及文件**：`apps/web/src/app/login/page.tsx`

**具体改动**：catch 块中区分网络错误（"Failed to fetch"/"aborted"）和认证错误（401/403），显示不同文案。同时处理 AbortController 超时。

**验证方法**：
1. 输入错误密码，确认提示"邮箱或密码不正确"
2. 断网后提交，确认提示"网络连接失败"

**依赖**：无

---

#### S-20：网络错误时不清除 session 状态

**问题编号**：H-009 (P2)

**涉及文件**：`apps/web/src/components/auth/session-banner.tsx`

**具体改动**：catch 块中仅 401/403 时清除 session，网络错误保留当前状态。

**验证方法**：
1. 登录后断网刷新，确认 SessionBanner 仍显示用户名
2. 恢复网络后刷新，确认 session 正常校验

**依赖**：S-07

---

### 第五批：P2 空状态与错误恢复（S-21 ~ S-26）

---

#### S-21：工会空状态增加操作入口

**问题编号**：H-012 (P2)

**涉及文件**：`apps/web/src/components/guild/guild-panel.tsx`

**具体改动**：空状态增加"返回主城区"链接按钮和引导文案。

**验证方法**：无工会数据时确认有引导按钮。

**依赖**：S-02

---

#### S-22：服务端会话判定改用 HTTP 状态码

**问题编号**：F-006 (P2)

**涉及文件**：`apps/web/src/lib/api-client.ts`, `apps/web/src/lib/server-session.ts`

**具体改动**：在 `fetchJsonWithHeaders` 抛出的错误中增加 `status` 属性，`server-session.ts` 改为检查 `status` 而非字符串匹配。

**验证方法**：过期 token 正确判定为 unauthenticated，断网判定为 api-unreachable。

**依赖**：无

---

#### S-23：EMPTY_SOP_RESULT 时间戳改为函数

**问题编号**：F-023 (P3)

**涉及文件**：`apps/web/src/lib/api-client.ts`

**具体改动**：将 `EMPTY_SOP_RESULT` 常量改为 `createEmptySopResult()` 函数，每次调用生成新时间戳。

**验证方法**：两次降级确认时间戳不同。

**依赖**：无

---

#### S-24：NPC 对话传递 studentId

**问题编号**：F-014 (P2)

**涉及文件**：`apps/web/src/components/world/world-shell.tsx`

**具体改动**：在 `NpcDialog` 渲染处增加 `studentId={session?.user.id}` prop。注意在组件顶部获取一次 session 而非 render 中反复调用。

**验证方法**：后端日志中确认包含 studentId 参数。

**依赖**：S-11

---

#### S-25：fetchAgentAvatarsSafe 支持 token

**问题编号**：F-018 (P2)

**涉及文件**：`apps/web/src/lib/api-client.ts`

**具体改动**：`fetchAgentAvatarsSafe` 增加可选 `token` 参数，传递给 `fetchJsonSafe`。

**验证方法**：确认登录后 avatar API 请求携带 Authorization header。

**依赖**：无

---

#### S-26：toTimeLabel 时区转换

**问题编号**：F-019 (P2)

**涉及文件**：`apps/web/src/lib/format.ts`

**具体改动**：将字符串截取改为 `date.toLocaleString("zh-CN", { hour12: false })`。

**验证方法**：确认时间显示为本地时区。

**依赖**：无

---

### 第六批：P2 响应式与可访问性（S-27 ~ S-33）

---

#### S-27：移动端浮动按钮避让

**问题编号**：H-013 (P2)

**涉及文件**：`apps/web/src/components/world/world-shell.tsx`

**具体改动**：底部按钮增加 `env(safe-area-inset-bottom)`，移动端断点下调整布局。

**验证方法**：375px 宽度下确认按钮不重叠。

**依赖**：S-01

---

#### S-28：NPC 对话框实现 focus trap

**问题编号**：H-014 (P2)

**涉及文件**：`apps/web/src/components/world/npc-dialog.tsx`

**具体改动**：对话框打开时聚焦输入框，Tab 键循环锁定，Escape 关闭后恢复焦点。

**验证方法**：Tab 键确认焦点在对话框内循环。

**依赖**：无

---

#### S-29：低透明度文字对比度修复

**问题编号**：H-015 (P2)

**涉及文件**：多个组件文件

**具体改动**：全局替换 `rgba(255,255,255,0.3)` → `0.6`，`0.4` → `0.65`，`0.5` → `0.7`。目标对比度 >= 4.5:1。

**验证方法**：使用 Chrome DevTools Accessibility 面板检查对比度。

**依赖**：无

---

#### S-30：Phaser Canvas 增加屏幕阅读器可达性

**问题编号**：H-016 (P2)

**涉及文件**：`apps/web/src/components/world/world-shell.tsx`

**具体改动**：Phaser mount div 增加 `role="img"` 和动态 `aria-label`，增加隐藏文本描述区域。

**验证方法**：使用 VoiceOver 确认能听到区域描述。

**依赖**：无

---

#### S-31：tab 栏增加 aria-controls 和键盘方向键导航

**问题编号**：H-024 (P3)

**涉及文件**：`apps/web/src/components/world/world-shell.tsx`

**具体改动**：tab 按钮增加 `aria-controls` 和 `id`，tablist 增加 `onKeyDown` 处理左右方向键。

**验证方法**：Tab 聚焦后按方向键确认区域切换。

**依赖**：无

---

#### S-32：按钮 hover 效果改用 CSS

**问题编号**：H-018 (P3)

**涉及文件**：`apps/web/src/app/login/page.tsx`, `apps/web/src/components/teacher/review-queue.tsx`

**具体改动**：移除 JS hover state，在 `globals.css` 中定义 `:hover` 样式。

**验证方法**：移动端确认不卡在 hover 状态。

**依赖**：无

---

#### S-33：消息列表自适应高度

**问题编号**：H-023 (P3)

**涉及文件**：`apps/web/src/components/chat/room-messages.tsx`

**具体改动**：`maxHeight: "400px"` → `maxHeight: "min(60vh, 600px)"`。

**验证方法**：大屏确认高度可达 600px，小屏确认约为 60vh。

**依赖**：无

---

### 第七批：P3 全维度修复（S-34 ~ S-45）

---

#### S-34：聊天页未认证提示修正

**问题编号**：F-029 (P3)

**涉及文件**：`apps/web/src/app/chat/page.tsx`

**具体改动**：第 137 行 `"请先登录学生账号。"` → `"请先登录账号。"`。

**依赖**：S-05

---

#### S-35：聊天提交内容硬编码英文改中文

**问题编号**：F-020 (P3)

**涉及文件**：`apps/web/src/components/chat/chat-room.tsx`

**具体改动**：第 229 行及后续英文硬编码改为中文。

**依赖**：无

---

#### S-36：GuildPanel "活跃"徽章改为动态状态

**问题编号**：F-021 (P3)

**涉及文件**：`apps/web/src/components/guild/guild-panel.tsx`

**具体改动**：根据 `collaborationPoints` 显示"活跃"或"休眠"。

**依赖**：无

---

#### S-37：移除 NPC dialog reply 死代码

**问题编号**：F-022 (P3)

**涉及文件**：`apps/web/src/components/world/npc-dialog.tsx`

**具体改动**：移除 `reply` state，内联到 `setHistory` 调用中。

**依赖**：无

---

#### S-38：SessionBanner 不再每次挂载重新保存 session

**问题编号**：F-024 (P3)

**涉及文件**：`apps/web/src/components/auth/session-banner.tsx`

**具体改动**：移除 `saveSession(nextSession)` 调用（除非 token 刷新）。

**依赖**：S-07

---

#### S-39：completed 和 open 任务状态区分

**问题编号**：F-026 (P3)

**涉及文件**：`apps/web/src/components/world/world-shell.tsx`

**具体改动**：第 386 行 `const isActive = quest.status === "open" || quest.status === "completed"` 改为 `const isActive = quest.status === "open"`。

**依赖**：无

---

#### S-40：API 调用并行化

**问题编号**：F-027 (P3)

**涉及文件**：`apps/web/src/app/chat/page.tsx`

**具体改动**：第 192-199 行串行调用改为 `Promise.all`。

**依赖**：无

---

#### S-41：列表渲染使用唯一 ID 替代数组索引作为 key

**问题编号**：F-028 (P3)

**涉及文件**：`apps/web/src/components/world/npc-dialog.tsx`, `apps/web/src/components/world/insight-panel.tsx`

**具体改动**：`key={i}` 和 `key={index}` 改为基于内容的唯一标识。

**依赖**：无

---

#### S-42：owner 视角"进入房间"链接修正

**问题编号**：F-030 (P3)

**涉及文件**：`apps/web/src/app/chat/page.tsx`

**具体改动**：第 242 行条件从 `effectiveViewerRole === "owner"` 改为 `effectiveViewerRole === "guest"`。

**依赖**：无

---

#### S-43：logo aria 标签修复

**问题编号**：H-025 (P3)

**涉及文件**：`apps/web/src/app/login/page.tsx`

**具体改动**：`<span role="img" aria-label="logo">` 改为 `<span aria-hidden="true">`。

**依赖**：无

---

#### S-44：InsightPanel 展开时避让工具栏

**问题编号**：H-019 (P3)

**涉及文件**：`apps/web/src/components/world/insight-panel.tsx`

**具体改动**：展开时调整 top 位置或 maxHeight。

**依赖**：无

---

#### S-45：lastActiveAt 使用实际评审时间

**问题编号**：R-037 (P3)

**涉及文件**：`apps/api/src/modules/memory/agent-avatar/agent-avatar.service.ts`

**具体改动**：第 193-194 行 `new Date().toISOString()` 改为使用 `pendingReview.createdAt`。需在查询 select 中增加 `createdAt: true`。

**验证方法**：确认 reviewing 状态 avatar 的 lastActiveAt 不再每次查询都变化。

**依赖**：无

---

## 附录 A：问题追踪矩阵

| 问题编号 | 优先级 | 实施步骤 | 依赖 | 状态 |
|----------|--------|----------|------|------|
| H-002 | P1 | S-01 | 无 | 待实施 |
| H-003 | P1 | S-02, S-04 | S-07 | 待实施 |
| H-005 | P1 | S-03 | 无 | 待实施 |
| H-006 | P1 | S-06 | 无 | 待实施 |
| H-004 | P1 | S-08 | 无 | 待实施 |
| F-001 | P1 | S-09 | 无 | 待实施 |
| F-002 | P1 | S-10 | 后端确认 | 待实施 |
| R-005 | P1 | S-11 | DB 迁移 | 待实施 |
| H-008 | P2 | S-13 | 无 | 待实施 |
| H-010 | P2 | S-14 | 无 | 待实施 |
| H-011 | P2 | S-15 | 无 | 待实施 |
| H-017 | P2 | S-16 | 无 | 待实施 |
| F-005 | P2 | S-07 | 无 | 待实施 |
| F-009 | P2 | S-19 | 无 | 待实施 |
| F-010 | P2 | S-05 | 无 | 待实施 |
| F-013 | P2 | S-03 | 无 | 待实施 |
| F-012 | P2 | S-12 | S-09 | 待实施 |
| F-014 | P2 | S-24 | S-11 | 待实施 |
| F-018 | P2 | S-25 | 无 | 待实施 |
| F-019 | P2 | S-26 | 无 | 待实施 |
| H-009 | P2 | S-20 | S-07, S-22 | 待实施 |
| H-012 | P2 | S-21 | S-02 | 待实施 |
| H-013 | P2 | S-27 | S-01 | 待实施 |
| H-014 | P2 | S-28 | 无 | 待实施 |
| H-015 | P2 | S-29 | 无 | 待实施 |
| H-016 | P2 | S-30 | 无 | 待实施 |
| H-022 | P3 | S-04 | S-07 | 待实施 |
| H-018 | P3 | S-32 | 无 | 待实施 |
| H-019 | P3 | S-44 | 无 | 待实施 |
| H-020 | P3 | S-17 | 无 | 待实施 |
| H-021 | P3 | S-18 | 无 | 待实施 |
| H-023 | P3 | S-33 | 无 | 待实施 |
| H-024 | P3 | S-31 | 无 | 待实施 |
| H-025 | P3 | S-43 | 无 | 待实施 |
| F-006 | P2 | S-22 | 无 | 待实施 |
| F-020 | P3 | S-35 | 无 | 待实施 |
| F-021 | P3 | S-36 | 无 | 待实施 |
| F-022 | P3 | S-37 | 无 | 待实施 |
| F-023 | P3 | S-23 | 无 | 待实施 |
| F-024 | P3 | S-38 | S-07 | 待实施 |
| F-026 | P3 | S-39 | 无 | 待实施 |
| F-027 | P3 | S-40 | 无 | 待实施 |
| F-028 | P3 | S-41 | 无 | 待实施 |
| F-029 | P3 | S-34 | S-05 | 待实施 |
| F-030 | P3 | S-42 | 无 | 待实施 |
| R-037 | P3 | S-45 | 无 | 待实施 |

---

## 附录 B：文件变更清单

### 新建文件

| 文件路径 | 说明 |
|----------|------|
| `apps/web/src/components/shared/degraded-banner.tsx` | 统一降级提示组件 |
| `apps/api/prisma/migrations/xxx_add_npc_memory/` | NPC 记忆表迁移 |

### 修改文件

| 文件路径 | 涉及步骤 |
|----------|----------|
| `apps/web/src/components/world/world-shell.tsx` | S-01, S-03, S-06, S-12, S-16, S-24, S-27, S-30, S-31, S-39 |
| `apps/web/src/components/world/npc-dialog.tsx` | S-28, S-37, S-41 |
| `apps/web/src/components/world/phaser-scene.ts` | S-10 |
| `apps/web/src/components/world/insight-panel.tsx` | S-41, S-44 |
| `apps/web/src/components/auth/session-banner.tsx` | S-04, S-07, S-20, S-38 |
| `apps/web/src/components/guild/guild-panel.tsx` | S-18, S-21, S-36 |
| `apps/web/src/components/chat/chat-room.tsx` | S-35 |
| `apps/web/src/components/chat/room-messages.tsx` | S-33 |
| `apps/web/src/components/teacher/review-queue.tsx` | S-14, S-32 |
| `apps/web/src/components/quests/day-panel.tsx` | S-15 |
| `apps/web/src/app/page.tsx` | S-03, S-07, S-13 |
| `apps/web/src/app/chat/page.tsx` | S-02, S-05, S-07, S-13, S-34, S-40, S-42 |
| `apps/web/src/app/guilds/page.tsx` | S-02, S-05, S-07, S-13, S-18 |
| `apps/web/src/app/teacher/page.tsx` | S-05, S-07, S-13 |
| `apps/web/src/app/login/page.tsx` | S-08, S-19, S-32, S-43 |
| `apps/web/src/app/layout.tsx` | S-17 |
| `apps/web/src/app/globals.css` | S-17, S-32 |
| `apps/web/src/lib/api-client.ts` | S-09, S-22, S-23, S-25 |
| `apps/web/src/lib/server-session.ts` | S-22 |
| `apps/web/src/lib/format.ts` | S-26 |
| `apps/api/prisma/schema.prisma` | S-11 |
| `apps/api/src/modules/memory/memory.service.ts` | S-11 |
| `apps/api/src/modules/memory/npc-conversation.service.ts` | S-11 |
| `apps/api/src/modules/memory/agent-avatar/agent-avatar.service.ts` | S-45 |

---

## 实施顺序建议

### 第一批（P1，无依赖，可并行）
S-01, S-02, S-05, S-06, S-08, S-09

### 第二批（P1，有依赖）
S-03 -> S-07 -> S-04
S-10（需后端确认）
S-11（需 DB 迁移）
S-12（依赖 S-09）

### 第三批（P2，无依赖，可并行）
S-13, S-14, S-15, S-16, S-19, S-22, S-23, S-25, S-26, S-28, S-29, S-30, S-31, S-32, S-33

### 第四批（P2，有依赖）
S-20（依赖 S-07, S-22）
S-21（依赖 S-02）
S-24（依赖 S-11）
S-27（依赖 S-01）

### 第五批（P3，可批量处理）
S-34, S-35, S-36, S-37, S-38, S-39, S-40, S-41, S-42, S-43, S-44, S-45

---

> **备注**：所有步骤均可独立执行和验证。建议在实施前先运行 `pnpm test` 确认基线测试通过，每完成一批步骤后运行测试确认无回归。关键证据引用：
> - F-002 证据：`phaser-scene.ts:583` `const avatar = avatars?.[i]` 按数组下标匹配
> - R-005 证据：`schema.prisma:240` `AgentMemory` 外键约束 + `npc-conversation.service.ts:88` 使用 `npc:receptionist` 作为 studentId
> - F-023 证据：`api-client.ts:688` `EMPTY_SOP_RESULT` 的 `completedAt: new Date().toISOString()` 在模块加载时固定
> - R-037 证据：`agent-avatar.service.ts:193-194` `lastActiveAt: new Date().toISOString()` 使用当前时间
