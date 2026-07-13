# Teacher Four-Zone Observer UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the approved Teacher Observer Studio layout in the v3 prototype and add a repeatable loop that validates all four zones, their distinct content, interactions, responsive layout, and visual constraints.

**Architecture:** Keep the current formal scene screenshots as the visual source of truth. Move v3 zone and actor metadata into a small browser-global model, render a zone-specific observer panel from that model, and keep all write actions as explicit read-only/jump-out placeholders. A standalone Playwright script will start a temporary static server, run the same zone/actor checks in a loop, and write one screenshot per zone.

**Tech Stack:** Static HTML, CSS, browser JavaScript, Node.js, Playwright 1.61.1, Python `http.server` for the validation server.

## Global Constraints

- Only modify `prototypes/teacher-main-city-v3` and the new validation script/documentation needed to run it.
- Do not modify formal Phaser scenes, API contracts, database models, WebSocket behavior, or teaching business actions.
- Keep the formal screenshots as the only world visual source; do not draw a replacement map or add route overlays.
- Use 16:9 scene rendering and preserve the narrow-screen order: scene first, observer panel second.
- Keep observer actions read-only or explicit jump-out placeholders; never claim a business write succeeded.

---

### Task 1: Add the four-zone observer model

**Files:**
- Create: `prototypes/teacher-main-city-v3/observer-model.js`
- Modify: `prototypes/teacher-main-city-v3/index.html`
- Test: `scripts/validate-teacher-observer-v3.js` (created in Task 3)

**Interfaces:**
- Produces `window.TeacherObserverModel` with `scenes`, `people`, and `zonePanels`.
- `scenes[key]` returns `{ image, label, hotspots, hidden }`.
- `zonePanels[key]` returns `{ eyebrow, title, summary, metrics, sections, primaryAction }`.
- `people[key]` returns `{ role, status, task, agent, heartbeat, note, zone }`.

- [ ] **Step 1: Write the failing validation expectation**

Add the four zone expectations to the future loop:

```js
const zoneExpectations = {
  lobby: { title: "入口与导览", marker: "区域入口" },
  workstations: { title: "Agent 运行状态", marker: "最近心跳" },
  collab: { title: "交接与共享记忆", marker: "共享记忆" },
  review: { title: "证据与裁定", marker: "证据完整度" },
};
```

Run `node scripts/validate-teacher-observer-v3.js` after the script exists in Task 3; it must fail until the model and panel renderers exist.

- [ ] **Step 2: Implement the model**

Create `observer-model.js` with the existing four image paths, the current lobby/workstation actors, and explicit panel content. The scene model must contain these exact entries:

```js
const scenes = {
  lobby: { image: "./reference/office-lobby.png", label: "工作室大厅", hotspots: ["lobby-reception", "lobby-manager"], hidden: ["work-browser", "work-coder", "work-files", "work-standby"] },
  workstations: { image: "./reference/office-workstations.png", label: "工位区", hotspots: ["work-browser", "work-coder", "work-files", "work-standby"], hidden: ["lobby-reception", "lobby-manager"] },
  collab: { image: "./reference/office-collab.png", label: "协作室", hotspots: [], hidden: ["lobby-reception", "lobby-manager", "work-browser", "work-coder", "work-files", "work-standby"] },
  review: { image: "./reference/office-review.png", label: "评审区", hotspots: [], hidden: ["lobby-reception", "lobby-manager", "work-browser", "work-coder", "work-files", "work-standby"] },
};

window.TeacherObserverModel = {
  scenes,
  people: {
    Reception: { zone: "lobby", role: "大厅 NPC", status: "在线", task: "接待与区域引导", agent: "Reception Persona", heartbeat: "刚刚", note: "当前真实场景中的前台接待 NPC。" },
    Manager: { zone: "lobby", role: "大厅管理员 NPC", status: "巡场中", task: "更新区域公告", agent: "Guide Persona", heartbeat: "1 分钟前", note: "负责主城区导视和区域状态提示。" },
    Browser: { zone: "workstations", role: "浏览器 Agent", status: "工作中", task: "浏览双窗口并记录证据", agent: "Browser Agent", heartbeat: "刚刚", note: "当前处于工位区。" },
    Coder: { zone: "workstations", role: "代码 Agent", status: "工作中", task: "实现 API Contract", agent: "Coder Agent", heartbeat: "2 分钟前", note: "正在执行 Day 02 的代码任务。" },
    Files: { zone: "workstations", role: "文件 Agent", status: "工作中", task: "整理提交文件", agent: "Files Agent", heartbeat: "3 分钟前", note: "正在整理提交产物。" },
    Standby: { zone: "workstations", role: "待命 Agent", status: "需要关注", task: "等待任务分配", agent: "Standby Agent", heartbeat: "18 分钟前", note: "长时间没有收到新的任务或心跳。" },
  },
  zonePanels: {
    lobby: { eyebrow: "CITY ENTRY", title: "入口与导览", marker: "区域入口" },
    workstations: { eyebrow: "AGENT RUNTIME", title: "Agent 运行状态", marker: "最近心跳" },
    collab: { eyebrow: "SHARED MEMORY", title: "交接与共享记忆", marker: "共享记忆" },
    review: { eyebrow: "EVIDENCE DESK", title: "证据与裁定", marker: "证据完整度" },
  },
};
```

Use concrete metrics for each zone instead of reusing the same status labels. Include a `primaryAction` label and `actionNotice` copy that clearly says the prototype is read-only.

- [ ] **Step 3: Load the model before the app**

In `index.html`, load `observer-model.js` immediately before `app.js` so `app.js` has a stable model boundary and no longer owns all static zone data.

- [ ] **Step 4: Run the targeted browser loop**

Run `node scripts/validate-teacher-observer-v3.js`.

Expected: FAIL only on renderer assertions if Task 2 has not been completed; no JavaScript load error.

- [ ] **Step 5: Commit**

```bash
git add prototypes/teacher-main-city-v3/observer-model.js prototypes/teacher-main-city-v3/index.html
git commit -m "refactor: separate teacher observer zone model"
```

### Task 2: Render the approved four-zone UI

**Files:**
- Modify: `prototypes/teacher-main-city-v3/app.js`
- Modify: `prototypes/teacher-main-city-v3/index.html`
- Modify: `prototypes/teacher-main-city-v3/styles.css`

**Interfaces:**
- `setScene(key)` updates scene image, active Tab, hotspot visibility, zone panel, and current scene label.
- `renderZonePanel(key)` renders a zone-specific read-only panel with `data-zone-panel="key"`.
- `showPerson(key)` renders actor details while preserving the zone panel title and the read-only boundary.

- [ ] **Step 1: Add failing UI assertions to the loop**

The loop must assert after each Tab click:

```js
await expect(page.locator('[data-zone-panel="' + zone + '"]')).toBeVisible();
await expect(page.locator('#observer-panel')).toContainText(expectation.marker);
await expect(page.locator('#observer-panel')).toContainText("只读");
```

For the lobby and workstations, click `Reception` and `Coder` respectively and assert the profile shows the correct actor name and keeps the zone marker visible.

- [ ] **Step 2: Replace static empty panel markup**

Keep a stable panel shell in `index.html`, but add a `data-panel-content` mount point. Add a `zone-context` block near the top of the scene frame to show the current zone label without covering the scene center.

- [ ] **Step 3: Implement zone panel rendering**

In `app.js`, render the complete panel shell:

```js
function renderZonePanel(key) {
  const panelData = model.zonePanels[key];
  panel.innerHTML = `<div class="panel-top"><span>${panelData.eyebrow}</span><b>READ ONLY</b></div><div class="zone-panel" data-zone-panel="${key}"><span class="profile-kicker">CURRENT ZONE</span><h2>${panelData.title}</h2><p class="zone-summary">${panelData.summary}</p><div class="zone-metrics">${panelData.metrics.map((metric) => `<div class="metric-card"><span>${metric.label}</span><b>${metric.value}</b></div>`).join("")}</div><div class="zone-sections">${panelData.sections.map((section) => `<div class="zone-section"><span>${section.label}</span><b>${section.value}</b></div>`).join("")}</div><button class="profile-action" data-action="zone-primary">${panelData.primaryAction}</button><p class="profile-note">${panelData.actionNotice}</p></div>`;
}
```

The panel must render eyebrow, title, a short summary, three or four metrics, a section list, a read-only primary action, and an explicit data availability note. `setScene` calls `renderZonePanel(key)` after switching the image.

- [ ] **Step 4: Preserve actor inspection**

`showPerson(key)` renders an actor profile inside the same panel. Include a back button labelled `返回区域概览` that calls `renderZonePanel(currentZone)`. Keep `只读观察` visible in every state.

- [ ] **Step 5: Improve CSS hierarchy and responsiveness**

Update `styles.css` so:

- The panel has a compact zone header, metric grid, section rows, and one restrained action.
- Status colors follow blue structure, green healthy/synced, amber pending, and rose risk/offline.
- The active Tab is visually clear without adding a second navigation rail.
- The scene remains `aspect-ratio: 16 / 9`, uses `object-fit: fill`, and has no route overlay selectors or pseudo-elements.
- At `max-width: 1100px`, the scene renders before the observer panel without horizontal overflow.

- [ ] **Step 6: Run the loop**

Run `node scripts/validate-teacher-observer-v3.js`.

Expected: all four zone panel assertions and the two actor profile assertions pass.

- [ ] **Step 7: Commit**

```bash
git add prototypes/teacher-main-city-v3/app.js prototypes/teacher-main-city-v3/index.html prototypes/teacher-main-city-v3/styles.css
git commit -m "feat: add four-zone teacher observer panels"
```

### Task 3: Add the self-check loop and screenshot artifacts

**Files:**
- Create: `scripts/validate-teacher-observer-v3.js`
- Modify: `prototypes/teacher-main-city-v3/README.md`
- Create at runtime: `artifacts/screenshots/teacher-observer-v3/*.png`

**Interfaces:**
- Command: `node scripts/validate-teacher-observer-v3.js`
- Output: one line per zone, a final `teacher observer v3 loop: PASS`, and four screenshots.
- The script owns a temporary server on port `4176` and terminates it in `finally`.

- [ ] **Step 1: Write the loop before implementation is complete**

Use the repository-pinned Playwright runtime at `/Users/alex/Downloads/game-system-two/node_modules/.pnpm/playwright@1.61.1/node_modules/playwright`. Start `python3 -m http.server 4176 --directory prototypes/teacher-main-city-v3`, wait for `http://127.0.0.1:4176`, and create a fresh browser context at `1440×900`.

- [ ] **Step 2: Implement deterministic zone checks**

Loop over `lobby`, `workstations`, `collab`, and `review`. For each zone:

1. Click `[data-zone="${zone}"]`.
2. Assert `#scene-name` and `[data-zone-panel="${zone}"]`.
3. Assert the expected unique marker and `只读` are visible.
4. Assert `document.body.innerText` contains none of `虚线`, `路线编号`, `PATH ROUTES`, or `AGENT BEHAVIOR`.
5. Assert `document.documentElement.scrollWidth <= document.documentElement.clientWidth` at desktop and mobile widths.
6. Capture `artifacts/screenshots/teacher-observer-v3/${zone}.png`.

Then click lobby `Reception` and workstations `Coder`, assert the actor headings, and capture `lobby-reception.png` and `workstations-coder.png`.

- [ ] **Step 3: Add the runbook**

Document the command, output directory, and what the loop proves in `prototypes/teacher-main-city-v3/README.md`.

- [ ] **Step 4: Run the complete loop**

Run:

```bash
node scripts/validate-teacher-observer-v3.js
```

Expected output includes:

```text
lobby: PASS
workstations: PASS
collab: PASS
review: PASS
teacher observer v3 loop: PASS
```

- [ ] **Step 5: Commit**

```bash
git add scripts/validate-teacher-observer-v3.js prototypes/teacher-main-city-v3/README.md
git commit -m "test: add teacher observer v3 self-check loop"
```

### Task 4: Visual and regression verification

**Files:**
- Verify: `prototypes/teacher-main-city-v3`
- Verify: `artifacts/screenshots/teacher-observer-v3`

- [ ] **Step 1: Run the loop from a clean server state**

Run `node scripts/validate-teacher-observer-v3.js` and confirm all four zones pass.

- [ ] **Step 2: Inspect the four generated screenshots**

Confirm the formal scene remains visible, the right panel is readable, and no route overlay or stale panel content appears.

- [ ] **Step 3: Run repository whitespace validation**

Run `git diff --check`.

- [ ] **Step 4: Update the implementation plan status**

Mark this task complete only after the loop and screenshot inspection both pass.
