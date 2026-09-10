const students = {
  Lin: { role: "前端开发 Agent", status: "工作中", task: "Day 02 · Prompt Iteration", agent: "Frontend Developer", heartbeat: "刚刚 · 09:41", note: "已完成第一轮页面迭代，等待教师查看提交。" },
  Mo: { role: "后端开发 Agent", status: "在线", task: "Day 02 · API Contract", agent: "Backend Developer", heartbeat: "2 分钟前 · 09:40", note: "正在和架构 Agent 对齐提交接口字段。" },
  Kai: { role: "测试专家 Agent", status: "需要关注", task: "Day 01 · Test Failure", agent: "Test Expert", heartbeat: "18 分钟前 · 09:24", note: "连续三次测试失败，需要教师介入确认环境。" },
};

const inspector = document.querySelector("#inspector");
const toast = document.querySelector("#toast");

function notify(message) {
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(notify.timer);
  notify.timer = setTimeout(() => toast.classList.remove("show"), 2200);
}

function renderStudent(name) {
  const student = students[name];
  inspector.innerHTML = `<div class="inspector-content">
    <span class="micro">STUDENT INSPECTOR</span>
    <h2>${name}</h2><span class="role">${student.role}</span>
    <div class="inspector-status"><span>当前状态</span><b>${student.status}</b></div>
    <ul class="facts">
      <li><span>当前任务</span><b>${student.task}</b></li>
      <li><span>Agent 角色</span><b>${student.agent}</b></li>
      <li><span>最近心跳</span><b>${student.heartbeat}</b></li>
      <li><span>教师权限</span><b>只读观察</b></li>
    </ul>
    <button class="read-only" data-action="toast">查看学生房间 →</button>
    <p class="inspector-note">${student.note}</p>
  </div>`;
  inspector.querySelector("[data-action]").addEventListener("click", () => notify("学生房间只读视图将在下一版展开"));
  document.querySelectorAll(".actor").forEach((actor) => actor.classList.toggle("is-inspected", actor.dataset.student === name));
}

document.addEventListener("click", (event) => {
  const target = event.target.closest("button");
  if (!target) return;
  if (target.dataset.student) renderStudent(target.dataset.student);
  if (target.dataset.action === "toast") notify("这是教师视角原型按钮，暂不连接真实业务");
  if (target.dataset.action === "back") notify("返回工作台交互将在正式路由接入");
  if (target.dataset.zone) {
    document.querySelectorAll(".zone").forEach((zone) => zone.classList.toggle("active", zone === target));
    notify(`${target.querySelector("b").textContent} · 场景切换原型`);
  }
});
