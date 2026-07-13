# 基于真实 Phaser 场景的教师观察原型 v3

这版不是重新绘制办公室，而是直接使用当前正式场景截图作为底图，在上面叠加教师观察模式、区域切换和人物检查面板。

## 预览

```bash
python3 -m http.server 4175 --directory prototypes/teacher-main-city-v3
```

打开 <http://localhost:4175>。

## 四区自检 Loop

从项目根目录运行：

```bash
node scripts/validate-teacher-observer-v3.js
```

Loop 会临时启动 `4176` 静态服务，逐一检查大厅、工位区、协作室、评审区的专属面板、只读边界、人物点击、禁止路线文案和窄屏横向溢出，并生成截图到 `artifacts/screenshots/teacher-observer-v3/`。

## 设计来源

- `reference/office-lobby.png`
- `reference/office-workstations.png`
- `reference/office-collab.png`
- `reference/office-review.png`

这些图片是 2026-07-13 从当前正式 Web 场景重新截取的验收图，原图保存在 `artifacts/screenshots/formal-current/`，不会被正式 Web 运行时引用。

## 本轮要判断的不是美术，而是产品交互

1. 教师观察层是否应该直接叠加在正式 Phaser 画布旁边。
2. 点击 NPC/Agent 后，右侧面板是否比弹窗更合适。
3. 区域切换是否沿用当前顶部 Tab，不增加第二套导航。
4. “只读观察”是否足够清楚，能否避免教师误操作学生任务。
5. 需要显示哪些实时字段：状态、任务、Agent 角色、心跳、房间入口。
