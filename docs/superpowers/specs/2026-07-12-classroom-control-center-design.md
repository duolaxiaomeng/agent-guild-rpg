# 课堂指挥台设计

## 1. 背景与目标

当前项目已经具备课程 Day、Agent 提交与评审、聊天室、房间授权、教师学情和 Phaser 世界壳。课中环节仍主要依赖页面展示，老师不能在一个入口内控制课堂阶段，学生求助也没有认领、处理和复盘闭环。

本设计新增“课堂指挥台”，服务一场真实课堂的现场执行：

1. 老师可以启动课堂、控制阶段、暂停、延长、结束并解锁下一阶段。
2. 学生能看到当前阶段、目标和倒计时，并能发起求助。
3. 老师和助教能认领求助、进入对应房间、记录处理结果。
4. 所有课堂操作和求助处理都能追溯。
5. Socket.IO 只负责即时广播，REST 与数据库仍是业务真相，断线时流程可继续。

## 2. 范围

### 第一版包含

- 一次课堂场次对应一个课程世界和一个当前 Day。
- 一个课堂包含多个有序阶段，例如讲解、个人实践、互测、提交。
- 阶段状态：`draft`、`running`、`paused`、`completed`、`ended_early`。
- 服务端计时，支持暂停、延长和提前结束。
- 老师控制阶段推进。
- 课堂内的老师/助教身份分配。
- 学生求助，状态为 `open`、`claimed`、`resolved`、`cancelled`。
- 求助认领唯一性、进入学生房间和解决备注。
- 课堂事件审计记录。
- Web 页面、Socket.IO 广播、断线后的 REST/轮询降级。

### 第一版不包含

- 多班级同时排课。
- 自动排班、助教绩效和复杂组织架构。
- 课堂录像、完整行为回放和高级报表。
- 自动替老师决定延时或解锁。
- 将助教升级为全局账号角色。

## 3. 设计原则

### 3.1 课程内容与课堂执行分离

`CourseWorld` 和 `QuestDay` 继续表达课程内容和教学解锁；新增课堂模型表达一次现场执行。像素世界、教师页面和学生页面只消费课堂快照，不自行推断阶段状态。

### 3.2 服务端是真相

阶段计时由服务端计算。数据库保存阶段开始时间、累计暂停时长、延长时长和状态版本；浏览器只显示倒计时。客户端刷新、休眠、断线重连后都以服务端快照重新计算。

### 3.3 关系身份不改变全局账号角色

系统仍只保留 `teacher`、`student` 两类真实账号。助教通过课堂内的 `ClassroomStaffAssignment` 表达，不新增全局 `assistant` 用户角色；因此学生助教也可以在某次课堂中承担助教职责，而不会改变其学生账号权限。

### 3.4 重要状态变更可追溯

阶段控制、解锁和求助处理与 `ClassroomEvent` 在同一事务中写入。事件记录用于课堂复盘和后续统计，不作为客户端实时状态的唯一读取来源。

## 4. 核心数据模型

以下为 Prisma 模型的目标形状，字段命名可以按现有 schema 风格调整。

### 4.1 ClassroomSession

- `id`
- `courseWorldId`
- `dayId`
- `teacherId`
- `status`: `draft | live | completed`
- `currentStageId`，可为空
- `startedAt`、`endedAt`
- `version`，用于拒绝旧客户端操作
- `createdAt`、`updatedAt`

约束：同一课程世界只能有一个 `live` 场次；一个场次只能有一个当前阶段。

### 4.2 ClassroomStage

- `id`
- `sessionId`
- `title`
- `description`
- `sortOrder`
- `durationSeconds`
- `extensionSeconds`，默认 0
- `startedAt`
- `pausedAt`
- `accumulatedPauseSeconds`，默认 0
- `status`: `draft | running | paused | completed | ended_early`
- `version`
- `createdAt`、`updatedAt`

剩余时间按服务端当前时间、`startedAt`、`accumulatedPauseSeconds`、`durationSeconds + extensionSeconds`计算，不持久化一个容易漂移的 `remainingSeconds`。

### 4.3 ClassroomStaffAssignment

- `id`
- `sessionId`
- `userId`
- `role`: `teacher | assistant`
- `createdAt`

约束：每个场次只能有一个 `teacher` assignment；同一用户不能重复分配到同一场次。

### 4.4 HelpRequest

- `id`
- `sessionId`
- `studentId`
- `category`: `blocked | environment | question | review | other`
- `message`
- `status`: `open | claimed | resolved | cancelled`
- `assigneeId`，可为空
- `resolutionNote`，可为空
- `createdAt`、`claimedAt`、`resolvedAt`
- `version`

认领使用条件更新或事务锁，保证同一个 `open` 求助只能被一个老师/助教成功认领。

### 4.5 ClassroomEvent

- `id`
- `sessionId`
- `actorId`
- `eventType`: `session_started | stage_started | stage_paused | stage_extended | stage_completed | stage_ended_early | stage_unlocked | help_created | help_claimed | help_resolved | help_cancelled`
- `targetId`，可为空
- `payload`，JSON
- `createdAt`

事件是追加写入，不允许修改历史记录。

## 5. 状态流

### 5.1 阶段

```text
draft -> running -> paused -> running -> completed
                    \
                     -> ended_early
```

- 老师只能从当前阶段触发合法转换。
- `paused` 阶段不能重复暂停；`completed` 和 `ended_early` 阶段不能继续延时。
- 完成或提前结束后，老师可以解锁下一个 `draft` 阶段。
- 解锁不自动开始，开始动作仍由老师明确触发。

### 5.2 求助

```text
open -> claimed -> resolved
  \
   -> cancelled
```

- 学生创建时为 `open`。
- 老师或助教成功认领后变为 `claimed`，保存 `assigneeId` 和 `claimedAt`。
- 只有认领人或老师能解决求助；解决时可填写处理记录。
- 学生可以取消自己的 `open` 求助；已认领的求助不能由学生直接删除。

## 6. API 与权限

### 6.1 课堂控制

```text
POST /classrooms/sessions
POST /classrooms/sessions/:id/start
POST /classrooms/stages/:id/pause
POST /classrooms/stages/:id/extend
POST /classrooms/stages/:id/complete
POST /classrooms/stages/:id/end-early
POST /classrooms/stages/:id/unlock-next
GET  /classrooms/sessions/:id
```

创建、启动、暂停、延时、结束和解锁接口只允许场次老师调用。请求携带 `expectedVersion`；版本不匹配返回冲突错误并要求客户端重新读取快照。

### 6.2 求助处理

```text
GET  /classrooms/sessions/:id/help-requests
POST /classrooms/help-requests
POST /classrooms/help-requests/:id/claim
POST /classrooms/help-requests/:id/resolve
POST /classrooms/help-requests/:id/cancel
```

- 学生只能为自己创建和取消求助。
- 场次老师和已分配助教可以查看、认领和处理求助。
- 非场次成员不能读取课堂求助或进入对应协作房间。
- 进入学生房间仍复用现有房间授权逻辑，不绕过聊天室权限。

### 6.3 错误语义

- `403`：身份不具备该场次权限。
- `404`：场次、阶段或求助不存在。
- `409`：阶段版本过期、状态转换非法或求助已被他人认领。
- `422`：延长时长、求助内容等输入不合法。

## 7. Web 页面

### 7.1 教师工作台

在现有 `/teacher` 页面增加当前课堂指挥台：

- 顶部显示课程、Day、阶段名称、剩余时间。
- 控制区提供开始、暂停、延长 5/10/15 分钟、结束、解锁下一阶段。
- 阶段轨道显示已完成、进行中和未开始阶段。
- 求助队列按状态、等待时长和紧急程度排序。
- 求助卡片显示学生、问题摘要、等待时间、认领人、进入房间和解决操作。
- 继续保留现有评审队列与班级学情，课堂指挥台作为实时区置于上方。

### 7.2 助教视图

复用教师工作台的课堂上下文，但阶段控制按钮只读。助教可以查看求助、认领、进入授权房间和填写解决记录。

### 7.3 学生视图

在主城区、工会大厅和聊天室顶部显示课堂状态条：当前 Day、阶段、目标和倒计时。学生点击“举手求助”打开轻量表单，提交后看到求助状态和处理人。课堂状态条不把 Phaser 场景作为数据源，世界壳只订阅课堂快照。

## 8. 实时与降级

服务端广播以下事件：

```text
classroom:stage:update
classroom:help:update
classroom:presence:update
```

事件包含 `sessionId`、`version`、服务端时间和最小展示字段。客户端收到旧版本事件时丢弃。

REST 是所有写操作的必经路径。Socket.IO 断开时：

1. 控制和求助写操作继续使用 REST。
2. 页面显示“实时连接已断开”提示。
3. 课堂快照和求助列表按固定间隔轮询。
4. 重连后先拉取完整快照，再恢复事件订阅。

广播失败不回滚已提交的数据库事务；服务端记录日志，客户端通过轮询最终收敛。

## 9. 事务与异常处理

- 阶段状态修改、场次版本递增和 `ClassroomEvent` 写入必须在同一事务中完成。
- 求助认领采用带状态条件的更新或事务锁，避免老师和助教重复认领。
- 所有控制接口支持幂等判断：目标状态已经达到时直接返回当前快照，不重复创建事件；只有状态仍可转换时才检查版本并写入新事件。
- 课堂结束后禁止新的阶段控制；未处理求助保留在历史中，并标记为 `cancelled` 或由老师继续处理。
- 学生刷新、重新登录或设备切换后，仍可读取自己当前场次和求助状态。

## 10. 测试与验收

### 契约与 API

- 阶段和求助状态枚举、合法转换、错误响应。
- 老师、助教、学生的权限边界。
- SQLite 集成测试覆盖：创建场次、启动阶段、暂停、延时、完成、解锁下一阶段。
- SQLite 集成测试覆盖：创建求助、并发认领、解决、取消和事件记录。

### 实时层

- 阶段更新广播包含版本和服务端时间。
- 求助创建、认领、解决会广播到正确的课堂频道。
- Socket mock 断开时 REST 流程仍可完成。

### Web

- 教师可以看到控制按钮并更新当前阶段。
- 助教看不到可用的阶段写操作，但能处理求助。
- 学生能看到倒计时和求助状态。
- 旧事件不会覆盖新状态。
- 断线空态和重连后的快照恢复可见。

### 浏览器验收

Playwright 烟雾流程：

1. 老师进入工作台并启动阶段。
2. 学生进入主城区，看到阶段和倒计时。
3. 学生发起求助。
4. 助教在指挥台认领求助并进入学生房间。
5. 助教标记解决，学生看到最新状态。
6. 刷新页面后课堂和求助记录仍存在。

## 11. 分阶段交付

### Phase 1：持久化和 REST 闭环

先实现 Prisma 模型、状态转换、权限、课堂快照和求助接口，使用 SQLite 集成测试锁住流程。

### Phase 2：教师/助教/学生页面

把课堂快照接入教师工作台、学生状态条和求助表单；确保服务端读、客户端写边界清晰。

### Phase 3：实时同步

接入课堂频道、阶段和求助事件，保留轮询降级，补实时层测试。

### Phase 4：课堂复盘基础

基于 `ClassroomEvent` 增加阶段耗时、求助响应时间和未解决求助摘要；不在第一版引入复杂报表。

## 12. 完成定义

当老师可以在一次真实课堂中控制阶段推进，学生可以看到并响应当前阶段，老师或助教可以处理学生求助，断线和刷新不会丢失状态，且所有关键动作都有自动化测试与事件记录时，课堂指挥台第一版完成。
