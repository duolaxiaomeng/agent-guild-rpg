# Office Zone Replication Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the existing `工位区` into a high-fidelity pixel office scene that closely matches the provided reference image while preserving the current world shell, tab structure, and Phaser boot flow.

**Architecture:** Keep the public surface of `WorldShell` unchanged and concentrate the work inside the world scene layer. Encode the replicated composition in two places: `zone-config.ts` for actor/landmark semantics, and `phaser-scene.ts` for a testable layout plan plus office-specific floor and prop rendering helpers.

**Tech Stack:** Next.js App Router, React 19, Phaser 3, TypeScript, Vitest, Testing Library

---

## File Map

- Modify: `apps/web/src/components/world/zone-config.ts`
- Modify: `apps/web/src/components/world/phaser-scene.ts`
- Create: `apps/web/src/components/world/zone-config.test.ts`
- Create: `apps/web/src/components/world/phaser-scene.test.ts`
- Reuse for regression only: `apps/web/src/components/world/world-shell.test.tsx`
- Reference only: `docs/superpowers/specs/2026-07-01-office-zone-replication-design.md`

### Task 1: Lock The Replicated Office Contract In Tests

**Files:**
- Create: `apps/web/src/components/world/zone-config.test.ts`
- Modify: `apps/web/src/components/world/zone-config.ts`
- Test: `apps/web/src/components/world/zone-config.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { ZONE_DEFS } from "./zone-config";

describe("workstations zone office replication", () => {
  it("matches the replicated office composition contract", () => {
    const zone = ZONE_DEFS.find((item) => item.id === "workstations");

    expect(zone).toBeDefined();
    expect(zone?.floorStyle).toBe("mixed");
    expect(zone?.agents).toHaveLength(5);
    expect(zone?.agents.filter((agent) => agent.seated)).toHaveLength(4);
    expect(zone?.npcs).toHaveLength(2);
    expect(zone?.landmarks.map((item) => item.label)).toEqual([
      "顶部展示墙",
      "中心工位",
      "休息区",
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web exec vitest run src/components/world/zone-config.test.ts`

Expected: FAIL because `workstations` currently uses `gray-tile`, has the wrong actor counts, and does not expose the replicated landmark labels.

- [ ] **Step 3: Write minimal implementation**

Update `apps/web/src/components/world/zone-config.ts` so the `workstations` zone reflects the new office composition:

```ts
{
  id: "workstations",
  label: "工位区",
  emoji: "💻",
  bgColor: "#f3f4f6",
  pathColor: "#d1d5db",
  baseTile: T.STONE,
  varTile: T.FLOOR,
  pathTile: T.WOOD,
  trees: false,
  floorStyle: "mixed",
  decorations: [],
  npcs: [
    { id: "walker-a", name: "巡场同事", x: 760, y: 178, tooltip: "去会议角聊一下", color: "#0f766e" },
    { id: "walker-b", name: "访客", x: 828, y: 194, tooltip: "刚从休息区路过", color: "#334155" },
  ],
  agents: [
    {
      id: "browser-agent",
      label: "Browser",
      badgeNum: 1,
      x: 208,
      y: 214,
      tooltip: "正在整理方案...",
      shirtColor: "#3b82f6",
      hairColor: "#92400e",
      statusIcon: "search",
      seated: true,
    },
    {
      id: "coder-agent",
      label: "Coder",
      badgeNum: 2,
      x: 324,
      y: 214,
      tooltip: "正在实现界面...",
      shirtColor: "#22c55e",
      hairColor: "#1e293b",
      statusIcon: "ok",
      seated: true,
    },
    {
      id: "files-agent",
      label: "Files",
      badgeNum: 3,
      x: 212,
      y: 374,
      tooltip: "正在整理文件...",
      shirtColor: "#a855f7",
      hairColor: "#78350f",
      statusIcon: "notify",
      seated: true,
    },
    {
      id: "ops-agent",
      label: "Ops",
      badgeNum: 4,
      x: 330,
      y: 374,
      tooltip: "正在关注异常提醒...",
      shirtColor: "#f97316",
      hairColor: "#7c2d12",
      statusIcon: "warning",
      seated: true,
    },
    {
      id: "focus-agent",
      label: "Lead",
      badgeNum: 5,
      x: 488,
      y: 424,
      tooltip: "正在协调任务...",
      shirtColor: "#2563eb",
      hairColor: "#6b21a8",
      seated: false,
    },
  ],
  landmarks: [
    { label: "顶部展示墙", x: 480, y: 72, color: "#475569" },
    { label: "中心工位", x: 480, y: 404, color: "#334155" },
    { label: "休息区", x: 786, y: 402, color: "#78716c" },
  ],
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter web exec vitest run src/components/world/zone-config.test.ts`

Expected: PASS with `1 passed`.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/world/zone-config.ts apps/web/src/components/world/zone-config.test.ts
git commit -m "test: lock workstations replication contract"
```

### Task 2: Add A Testable Office Layout Plan For The Workstations Scene

**Files:**
- Create: `apps/web/src/components/world/phaser-scene.test.ts`
- Modify: `apps/web/src/components/world/phaser-scene.ts`
- Test: `apps/web/src/components/world/phaser-scene.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/components/world/phaser-scene.test.ts` with semantic layout assertions:

```ts
import { describe, expect, it } from "vitest";
import { buildWorkstationsLayout } from "./phaser-scene";

describe("buildWorkstationsLayout", () => {
  it("returns the office composition anchors from the reference", () => {
    const layout = buildWorkstationsLayout(960, 540);

    expect(layout.wallBand).toEqual({ x: 64, y: 44, width: 832, height: 70 });
    expect(layout.doubleDeskAnchors).toHaveLength(4);
    expect(layout.multiScreenDesk).toEqual({ x: 160, y: 392 });
    expect(layout.focusDesk).toEqual({ x: 470, y: 394 });
    expect(layout.loungeRect).toEqual({ x: 610, y: 286, width: 246, height: 184 });
    expect(layout.walkerAnchors).toEqual([
      { x: 756, y: 176 },
      { x: 822, y: 196 },
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web exec vitest run src/components/world/phaser-scene.test.ts`

Expected: FAIL because `buildWorkstationsLayout` does not exist.

- [ ] **Step 3: Write minimal implementation**

Add a typed helper near the top of `apps/web/src/components/world/phaser-scene.ts`:

```ts
export type WorkstationsLayout = {
  wallBand: { x: number; y: number; width: number; height: number };
  doubleDeskAnchors: Array<{ x: number; y: number }>;
  multiScreenDesk: { x: number; y: number };
  focusDesk: { x: number; y: number };
  loungeRect: { x: number; y: number; width: number; height: number };
  walkerAnchors: Array<{ x: number; y: number }>;
};

export function buildWorkstationsLayout(vw: number, vh: number): WorkstationsLayout {
  return {
    wallBand: { x: Math.round(vw * 0.067), y: 44, width: Math.round(vw * 0.867), height: 70 },
    doubleDeskAnchors: [
      { x: 160, y: 214 },
      { x: 292, y: 214 },
      { x: 160, y: 292 },
      { x: 292, y: 292 },
    ],
    multiScreenDesk: { x: 160, y: 392 },
    focusDesk: { x: 470, y: 394 },
    loungeRect: { x: 610, y: 286, width: 246, height: 184 },
    walkerAnchors: [
      { x: 756, y: 176 },
      { x: 822, y: 196 },
    ],
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter web exec vitest run src/components/world/phaser-scene.test.ts`

Expected: PASS with `1 passed`.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/world/phaser-scene.ts apps/web/src/components/world/phaser-scene.test.ts
git commit -m "test: add workstations layout plan helper"
```

### Task 3: Rebuild The Floor Plan And Props For The Replicated Office

**Files:**
- Modify: `apps/web/src/components/world/phaser-scene.ts`
- Test: `apps/web/src/components/world/phaser-scene.test.ts`

- [ ] **Step 1: Write the failing test**

Extend `apps/web/src/components/world/phaser-scene.test.ts` with a floor-plan regression:

```ts
import { describe, expect, it } from "vitest";
import { T, ZONE_DEFS } from "./zone-config";
import { buildOfficeTilesForZone } from "./phaser-scene";

describe("buildOfficeTilesForZone", () => {
  it("uses gray tile workspace with a wood lounge for workstations", () => {
    const zone = ZONE_DEFS.find((item) => item.id === "workstations")!;
    const data = buildOfficeTilesForZone(48, 30, zone, 960, 540);

    expect(data[2][8]).toBe(T.FLOOR + 1);
    expect(data[12][9]).toBe(T.STONE + 1);
    expect(data[23][36]).toBe(T.WOOD + 1);
    expect(data[23][42]).toBe(T.WOOD_ALT + 1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web exec vitest run src/components/world/phaser-scene.test.ts`

Expected: FAIL because `buildOfficeTilesForZone` does not exist and the current generic generator does not produce the required lounge tiles.

- [ ] **Step 3: Write minimal implementation**

Refactor `apps/web/src/components/world/phaser-scene.ts` so the workstations zone uses a dedicated floor builder and dedicated prop composition:

```ts
export function buildOfficeTilesForZone(
  cols: number,
  rows: number,
  zone: ZoneDef,
  vw: number,
  vh: number,
): number[][] {
  if (zone.id !== "workstations") {
    return generateOfficeTiles(cols, rows, zone.baseTile, zone.varTile, zone.pathTile, zone, vw, vh);
  }

  const data = Array.from({ length: rows }, () =>
    Array.from({ length: cols }, (_, x) => (x % 5 === 0 ? tileVal(T.FLOOR) : tileVal(T.STONE))),
  );

  for (let y = 0; y < 5; y++) {
    for (let x = 4; x < cols - 4; x++) {
      data[y][x] = tileVal(T.FLOOR);
    }
  }

  for (let y = 16; y < rows - 2; y++) {
    for (let x = 31; x < cols - 2; x++) {
      data[y][x] = tileVal((x + y) % 2 === 0 ? T.WOOD : T.WOOD_ALT);
    }
  }

  return data;
}
```

Then replace the tilemap creation call:

```ts
const groundData = buildOfficeTilesForZone(cols, rows, zone, vw, vh);
```

Add office-specific prop helpers and a dedicated rendering branch:

```ts
function drawWallFrame(s: Phaser.Scene, cx: number, cy: number, accent: number) {
  const g = s.add.graphics();
  g.fillStyle(0x94a3b8, 1);
  g.fillRect(cx - 18, cy - 18, 36, 28);
  g.fillStyle(0xf8fafc, 1);
  g.fillRect(cx - 14, cy - 14, 28, 20);
  g.fillStyle(accent, 1);
  g.fillRect(cx - 10, cy - 8, 20, 10);
}

function drawBookshelf(s: Phaser.Scene, cx: number, cy: number) {
  const g = s.add.graphics();
  g.fillStyle(0x475569, 1);
  g.fillRect(cx - 20, cy - 28, 40, 56);
  g.fillStyle(0xf8fafc, 0.8);
  g.fillRect(cx - 18, cy - 10, 36, 4);
  g.fillRect(cx - 18, cy + 8, 36, 4);
  g.fillStyle(0x22c55e, 1);
  g.fillRect(cx - 14, cy - 22, 8, 10);
  g.fillStyle(0xf59e0b, 1);
  g.fillRect(cx - 2, cy - 22, 8, 10);
  g.fillStyle(0x3b82f6, 1);
  g.fillRect(cx + 10, cy - 22, 8, 10);
}

function drawLoungeSofa(s: Phaser.Scene, cx: number, cy: number) {
  const g = s.add.graphics();
  g.fillStyle(0x334155, 1);
  g.fillRect(cx - 30, cy - 16, 60, 32);
  g.fillRect(cx - 30, cy - 16, 16, 48);
  g.fillRect(cx + 14, cy - 16, 16, 48);
  g.fillStyle(0x64748b, 1);
  g.fillRect(cx - 24, cy - 10, 48, 20);
}

function drawWaterCooler(s: Phaser.Scene, cx: number, cy: number) {
  const g = s.add.graphics();
  g.fillStyle(0x334155, 1);
  g.fillRect(cx - 12, cy - 24, 24, 40);
  g.fillStyle(0x60a5fa, 0.85);
  g.fillCircle(cx, cy - 28, 10);
}
```

Use the layout helper inside scene rendering:

```ts
if (zone.id === "workstations") {
  const layout = buildWorkstationsLayout(vw, vh);

  drawWallFrame(scene, 120, 74, 0xf59e0b);
  drawWallFrame(scene, 168, 74, 0xef4444);
  drawStatusPanel(scene, 310, 74);
  drawBookshelf(scene, 584, 78);
  drawStatusPanel(scene, 706, 74);

  for (const anchor of layout.doubleDeskAnchors) {
    drawWorkstation(scene, anchor.x, anchor.y);
  }

  drawWorkstation(scene, layout.multiScreenDesk.x, layout.multiScreenDesk.y, zone.agents[2]);
  drawWorkstation(scene, layout.focusDesk.x, layout.focusDesk.y, zone.agents[4]);
  drawWaterCooler(scene, 646, 344);
  drawCoffeeStation(scene, 718, 344);
  drawLoungeSofa(scene, 770, 422);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
pnpm --filter web exec vitest run src/components/world/phaser-scene.test.ts
pnpm --filter web exec vitest run src/components/world/zone-config.test.ts src/components/world/world-shell.test.tsx
```

Expected:

- `phaser-scene.test.ts` PASS
- `zone-config.test.ts` PASS
- `world-shell.test.tsx` PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/world/phaser-scene.ts apps/web/src/components/world/phaser-scene.test.ts
git commit -m "feat: replicate office workstations scene"
```

### Task 4: Run Build, Capture Verification, And Record The Final State

**Files:**
- Modify if needed after QA: `apps/web/src/components/world/zone-config.ts`
- Modify if needed after QA: `apps/web/src/components/world/phaser-scene.ts`
- Test artifacts only, do not commit screenshots unless intentionally updating checked-in references

- [ ] **Step 1: Run the world-scene regression suite**

Run:

```bash
pnpm --filter web exec vitest run \
  src/components/world/zone-config.test.ts \
  src/components/world/phaser-scene.test.ts \
  src/components/world/world-shell.test.tsx
```

Expected: PASS with all world-scene tests green.

- [ ] **Step 2: Run the production build**

Run: `pnpm --filter web build`

Expected: PASS with a successful Next.js production build.

- [ ] **Step 3: Start the web app and visually inspect the replicated zone**

Run: `pnpm --filter web dev`

Then open the homepage, switch to `工位区`, and verify all of the following against the spec:

```txt
1. 顶部有连续墙面装饰带
2. 左侧有两排主工位群
3. 左下有多屏工作台
4. 中下有独立工位
5. 右下有木地板休息区
6. 右上与右中有两名走动人物
```

Expected: the first-screen composition reads like the provided office reference at a glance.

- [ ] **Step 4: Apply the smallest visual correction if inspection shows drift**

If one of the six checks fails, make only the smallest correction needed. Typical example:

```ts
// If the lounge feels too small, widen only the right-side lounge bounds.
loungeRect: { x: 598, y: 286, width: 258, height: 184 }
```

Or:

```ts
// If the wall band is too low, move it upward without changing the rest.
wallBand: { x: 64, y: 36, width: 832, height: 70 }
```

Then rerun:

```bash
pnpm --filter web exec vitest run src/components/world/phaser-scene.test.ts
pnpm --filter web build
```

Expected: the adjustment keeps tests and build green.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/world/zone-config.ts apps/web/src/components/world/phaser-scene.ts apps/web/src/components/world/zone-config.test.ts apps/web/src/components/world/phaser-scene.test.ts
git commit -m "feat: finalize replicated office zone layout"
```

---

## Self-Review

- Spec coverage: the plan covers the replicated composition contract, actor placement, floor materials, office props, shell regression, and final build/visual verification.
- Placeholder scan: no `TODO`, `TBD`, or implicit “handle appropriately” language remains.
- Type consistency: `buildWorkstationsLayout` and `buildOfficeTilesForZone` are introduced in Task 2 and Task 3, and the same names are used consistently in later steps.
