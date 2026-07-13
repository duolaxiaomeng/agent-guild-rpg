const scenes = {
  lobby: {
    image: "./reference/office-lobby.png",
    label: "工作室大厅",
    hotspots: ["lobby-reception", "lobby-manager"],
    hidden: ["work-browser", "work-coder", "work-files", "work-standby"],
  },
  workstations: {
    image: "./reference/office-workstations.png",
    label: "工位区",
    hotspots: ["work-browser", "work-coder", "work-files", "work-standby"],
    hidden: ["lobby-reception", "lobby-manager"],
  },
  collab: {
    image: "./reference/office-collab.png",
    label: "协作室",
    hotspots: [],
    hidden: ["lobby-reception", "lobby-manager", "work-browser", "work-coder", "work-files", "work-standby"],
  },
  review: {
    image: "./reference/office-review.png",
    label: "评审区",
    hotspots: [],
    hidden: ["lobby-reception", "lobby-manager", "work-browser", "work-coder", "work-files", "work-standby"],
  },
};

const people = {
  Reception: { zone: "lobby", role: "大厅 NPC", status: "在线", task: "接待与区域引导", agent: "Reception Persona", heartbeat: "刚刚", note: "当前真实场景中的前台接待 NPC。教师视角只读查看。" },
  Manager: { zone: "lobby", role: "大厅管理员 NPC", status: "巡场中", task: "更新区域公告", agent: "Guide Persona", heartbeat: "1 分钟前", note: "负责主城区导视和区域状态提示。" },
  Browser: { zone: "workstations", role: "浏览器 Agent", status: "工作中", task: "浏览双窗口并记录证据", agent: "Browser Agent", heartbeat: "刚刚", note: "当前处于工位区，教师可观察活动状态。" },
  Coder: { zone: "workstations", role: "代码 Agent", status: "工作中", task: "实现 API Contract", agent: "Coder Agent", heartbeat: "2 分钟前", note: "正在执行 Day 02 的代码任务。" },
  Files: { zone: "workstations", role: "文件 Agent", status: "工作中", task: "整理提交文件", agent: "Files Agent", heartbeat: "3 分钟前", note: "正在整理提交产物和任务文档。" },
  Standby: { zone: "workstations", role: "待命 Agent", status: "需要关注", task: "等待任务分配", agent: "Standby Agent", heartbeat: "18 分钟前", note: "长时间没有收到新的任务或心跳，建议教师查看。" },
};

const zonePanels = {
  lobby: {
    eyebrow: "CITY ENTRY",
    title: "入口与导览",
    summary: "从这里确认课堂在线情况，并快速进入需要观察的区域。",
    metrics: [
      { label: "课堂在线", value: "12 人", tone: "healthy" },
      { label: "区域入口", value: "4 个", tone: "info" },
      { label: "公告更新", value: "10 分钟", tone: "info" },
    ],
    sections: [
      { label: "当前入口", value: "主城区" },
      { label: "需要关注", value: "1 个 Agent" },
      { label: "下一步", value: "查看工位" },
    ],
    primaryAction: "打开区域导览",
    actionNotice: "教师观察模式只读，区域入口会跳转到正式场景。",
  },
  workstations: {
    eyebrow: "AGENT RUNTIME",
    title: "Agent 运行状态",
    summary: "查看每个 Agent 当前做什么、多久没有心跳，以及是否需要介入。",
    metrics: [
      { label: "进行中", value: "05", tone: "healthy" },
      { label: "待教师看", value: "02", tone: "pending" },
      { label: "离线", value: "01", tone: "risk" },
    ],
    sections: [
      { label: "最近心跳", value: "Coder · 2 分钟" },
      { label: "当前任务", value: "API Contract" },
      { label: "下一动作", value: "查看任务" },
    ],
    primaryAction: "打开任务详情",
    actionNotice: "不会在观察层修改任务或 Agent 状态。",
  },
  collab: {
    eyebrow: "SHARED MEMORY",
    title: "交接与共享记忆",
    summary: "确认多个 Agent 是否在同一房间协作，以及共享记忆是否已经同步。",
    metrics: [
      { label: "参与 Agent", value: "04", tone: "info" },
      { label: "共享记忆", value: "已同步", tone: "healthy" },
      { label: "待回应", value: "01", tone: "pending" },
    ],
    sections: [
      { label: "当前房间", value: "交接室 A" },
      { label: "最近交接", value: "Files → Coder" },
      { label: "下一动作", value: "查看记录" },
    ],
    primaryAction: "打开交接记录",
    actionNotice: "授权、发消息和修改共享记忆将在正式业务页面完成。",
  },
  review: {
    eyebrow: "EVIDENCE DESK",
    title: "证据与裁定",
    summary: "先看待评审数量和证据完整度，再进入教师工作台做最终判断。",
    metrics: [
      { label: "待评审", value: "03", tone: "pending" },
      { label: "AI 初评", value: "02", tone: "healthy" },
      { label: "风险提示", value: "01", tone: "risk" },
    ],
    sections: [
      { label: "证据完整度", value: "78%" },
      { label: "最新提交", value: "Day 02 · Coder" },
      { label: "下一动作", value: "进入评审台" },
    ],
    primaryAction: "打开教师评审台",
    actionNotice: "观察层不直接裁定，教师决定仍以评审工作台为准。",
  },
};

window.TeacherObserverModel = { scenes, people, zonePanels };
