const screens = { dashboard: document.querySelector("#teacher-dashboard"), city: document.querySelector("#teacher-city") };
const toast = document.querySelector("#toast");
const scene = document.querySelector("#world-scene");
const inspector = document.querySelector("#inspector-panel");
const zoneLabel = document.querySelector("#zone-label");

const students = {
  Lin: { role: "前端开发 Agent", state: "工作中", task: "Day 02 · Prompt Iteration", agent: "Frontend Developer", last: "刚刚 · 09:41", color: "blue" },
  Mo: { role: "后端开发 Agent", state: "在线", task: "Day 02 · API Contract", agent: "Backend Developer", last: "2 分钟前 · 09:40", color: "green" },
  Kai: { role: "测试专家 Agent", state: "需要关注", task: "Day 01 · Test Failure", agent: "Test Expert", last: "18 分钟前 · 09:24", color: "purple" },
};

function showScreen(name) {
  Object.entries(screens).forEach(([key, screen]) => screen.classList.toggle("is-active", key === name));
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("is-visible");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => toast.classList.remove("is-visible"), 2200);
}

function showStudent(name) {
  const student = students[name];
  inspector.innerHTML = `<div class="inspector-content">
    <span class="inspector-kicker">STUDENT OBSERVATION</span>
    <h3>${name}</h3>
    <span class="role">${student.role}</span>
    <div class="state-row"><span>当前状态</span><b>${student.state}</b></div>
    <ul class="inspector-list">
      <li><span>当前任务</span><b>${student.task}</b></li>
      <li><span>Agent 角色</span><b>${student.agent}</b></li>
      <li><span>最近心跳</span><b>${student.last}</b></li>
      <li><span>教师权限</span><b>只读观察</b></li>
    </ul>
    <button class="inspect-action" data-toast="学生房间只读视图原型暂未展开">查看学生房间 →</button>
  </div>`;
  inspector.querySelector("button").addEventListener("click", () => showToast("学生房间只读视图原型暂未展开"));
  document.querySelectorAll(".world-character").forEach((character) => character.classList.toggle("is-inspected", character.dataset.student === name));
}

document.addEventListener("click", (event) => {
  const target = event.target.closest("[data-go], [data-toast], .world-character, .zone-button");
  if (!target) return;
  if (target.dataset.go) showScreen(target.dataset.go);
  if (target.dataset.toast) showToast(target.dataset.toast);
  if (target.classList.contains("world-character")) showStudent(target.dataset.student);
  if (target.classList.contains("zone-button")) {
    document.querySelectorAll(".zone-button").forEach((button) => button.classList.toggle("is-selected", button === target));
    const labels = { lobby: "WORKSHOP LOBBY", workstations: "WORKSTATIONS", collab: "COLLAB ROOM", review: "REVIEW STATION" };
    zoneLabel.textContent = labels[target.dataset.zone];
    showToast(`${target.querySelector("b").textContent} · 原型场景切换`);
  }
});
