const model = window.TeacherObserverModel;
const image = document.querySelector("#scene-image");
const sceneName = document.querySelector("#scene-name");
const zoneContext = document.querySelector("#zone-context");
const panel = document.querySelector("#observer-panel");
const panelContent = document.querySelector("#panel-content");
const toast = document.querySelector("#toast");
let currentZone = "lobby";

function notify(message) {
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(notify.timer);
  notify.timer = setTimeout(() => toast.classList.remove("show"), 2300);
}

function metricMarkup(metric) {
  return `<div class="metric-card ${metric.tone || "info"}"><span>${metric.label}</span><b>${metric.value}</b></div>`;
}

function sectionMarkup(section) {
  return `<div class="zone-section"><span>${section.label}</span><b>${section.value}</b></div>`;
}

function renderZonePanel(key) {
  const panelData = model.zonePanels[key];
  currentZone = key;
  panelContent.innerHTML = `<div class="zone-panel" data-zone-panel="${key}">
    <span class="profile-kicker">${panelData.eyebrow}</span>
    <h2>${panelData.title}</h2>
    <p class="zone-summary">${panelData.summary}</p>
    <div class="zone-metrics">${panelData.metrics.map(metricMarkup).join("")}</div>
    <div class="zone-sections">${panelData.sections.map(sectionMarkup).join("")}</div>
    <button class="profile-action" data-action="zone-primary">${panelData.primaryAction} <span>↗</span></button>
    <p class="profile-note">${panelData.actionNotice}</p>
  </div>`;
}

function setScene(key) {
  const scene = model.scenes[key];
  image.src = scene.image;
  image.alt = `${scene.label}正式场景截图`;
  sceneName.textContent = scene.label;
  zoneContext.innerHTML = `<span>当前区域</span><b>${scene.label}</b>`;
  document.querySelectorAll(".zone-tabs button").forEach((button) => {
    button.classList.toggle("active", button.dataset.zone === key);
  });
  document.querySelectorAll(".hotspot").forEach((hotspot) => {
    const hotspotName = [...hotspot.classList].find((className) => className !== "hotspot" && className !== "is-hidden");
    hotspot.classList.toggle("is-hidden", scene.hidden.includes(hotspotName));
  });
  renderZonePanel(key);
  notify(`${scene.label} · 使用当前正式场景截图`);
}

function showPerson(key) {
  const person = model.people[key];
  const panelData = model.zonePanels[person.zone];
  currentZone = person.zone;
  panelContent.innerHTML = `<div class="profile" data-person-profile="${key}">
    <button class="back-link" data-action="back-zone">← 返回${model.scenes[person.zone].label}概览</button>
    <span class="profile-kicker">CURRENT ACTOR · ${panelData.eyebrow}</span>
    <span class="profile-zone">区域：${model.scenes[person.zone].label}</span>
    <h2>${key}</h2><span class="role">${person.role}</span>
    <div class="state"><span>当前状态</span><b>${person.status}</b></div>
    <ul class="facts">
      <li><span>当前任务</span><b>${person.task}</b></li>
      <li><span>Agent / Persona</span><b>${person.agent}</b></li>
      <li><span>最近心跳</span><b>${person.heartbeat}</b></li>
      <li><span>教师权限</span><b>只读观察</b></li>
    </ul>
    <button class="profile-action" data-action="person-primary">查看关联任务 <span>↗</span></button>
    <p class="profile-note">${person.note}</p>
  </div>`;
}

document.addEventListener("click", (event) => {
  const target = event.target.closest("button");
  if (!target) return;
  if (target.dataset.zone) setScene(target.dataset.zone);
  if (target.dataset.student) showPerson(target.dataset.student);
  if (target.dataset.action === "back-zone") renderZonePanel(currentZone);
  if (target.dataset.action === "zone-primary") notify("观察层只读，正在打开对应业务入口");
  if (target.dataset.action === "person-primary") notify("观察层只读，正在打开关联任务入口");
  if (target.dataset.action === "toast") notify("教师观察模式原型按钮，暂不连接真实业务");
});

setScene("lobby");
