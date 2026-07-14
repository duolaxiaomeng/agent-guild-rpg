# Office Third-Round Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the `workstations` office scene with mature office-pixel characters, stronger pose/facing fidelity, a more natural workstation island, and deeper pseudo-3D spatial layering without changing the project’s existing Next.js + Phaser structure.

**Architecture:** Split the work into two explicit layers. `zone-config.ts` remains the semantic source of truth for actor identity, pose, facing, and scene role, while scene rendering is pushed toward focused helpers so character drawing and layout polish do not keep bloating `phaser-scene.ts`. The scene should still be rendered by the existing world shell and pass the current build/test pipeline.

**Tech Stack:** Next.js App Router, React 19, Phaser 3, TypeScript, Vitest, Testing Library

---

## File Map

- Modify: `apps/web/src/components/world/zone-config.ts`
- Modify: `apps/web/src/components/world/zone-config.test.ts`
- Create: `apps/web/src/components/world/workstations-characters.ts`
- Create: `apps/web/src/components/world/workstations-characters.test.ts`
- Modify: `apps/web/src/components/world/phaser-scene.ts`
- Modify: `apps/web/src/components/world/phaser-scene.test.ts`
- Reuse for regression: `apps/web/src/components/world/world-shell.test.tsx`
- Reference only: `docs/superpowers/specs/2026-07-01-office-third-round-polish-design.md`

### Task 1: Lock The Third-Round Character Contract

**Files:**
- Modify: `apps/web/src/components/world/zone-config.test.ts`
- Modify: `apps/web/src/components/world/zone-config.ts`
- Test: `apps/web/src/components/world/zone-config.test.ts`

- [ ] **Step 1: Write the failing test**

Extend `apps/web/src/components/world/zone-config.test.ts` with a new contract test:

```ts
it("assigns mature office archetypes for the third-round polish", () => {
  const zone = ZONE_DEFS.find((item) => item.id === "workstations")!;

  expect(zone.agents.map((agent) => agent.pose)).toEqual([
    "focus",
    "typing",
    "focus",
    "typing",
    "standing",
  ]);
  expect(zone.agents.map((agent) => agent.archetype)).toEqual([
    "maker",
    "maker",
    "operator",
    "operator",
    "lead",
  ]);
  expect(zone.agents.map((agent) => agent.outfit)).toEqual([
    "blue-shirt",
    "green-jacket",
    "purple-shirt",
    "orange-jacket",
    "navy-lead",
  ]);
  expect(zone.npcs.map((npc) => npc.pose)).toEqual(["walking", "talking"]);
  expect(zone.npcs.map((npc) => npc.outfit)).toEqual([
    "teal-staff",
    "gray-visitor",
  ]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web exec vitest run src/components/world/zone-config.test.ts`

Expected: FAIL because `archetype` and `outfit` do not exist yet, and current poses are still the simpler second-round values.

- [ ] **Step 3: Write minimal implementation**

Update the type definitions near the top of `apps/web/src/components/world/zone-config.ts`:

```ts
export type OfficeOutfit =
  | "blue-shirt"
  | "green-jacket"
  | "purple-shirt"
  | "orange-jacket"
  | "navy-lead"
  | "teal-staff"
  | "gray-visitor";

export type OfficeArchetype = "maker" | "operator" | "lead" | "staff" | "visitor";
```

Then extend the actor types:

```ts
export type NpcDef = {
  id: string;
  name: string;
  x: number;
  y: number;
  tooltip: string;
  color: string;
  pose?: "walking" | "standing" | "talking" | "lounging";
  facing?: "left" | "right" | "up" | "down";
  archetype?: OfficeArchetype;
  outfit?: OfficeOutfit;
};

export type AgentDef = {
  id: string;
  label: string;
  badgeNum: number;
  x: number;
  y: number;
  tooltip: string;
  shirtColor: string;
  hairColor: string;
  statusIcon?: "search" | "warning" | "notify" | "ok";
  seated?: boolean;
  pose?: "typing" | "focus" | "standing" | "walking" | "talking";
  facing?: "left" | "right" | "up" | "down";
  archetype?: OfficeArchetype;
  outfit?: OfficeOutfit;
};
```

Update the `workstations` actors:

```ts
npcs: [
  {
    id: "walker-a",
    name: "巡场同事",
    x: 744,
    y: 188,
    tooltip: "去会议角聊一下",
    color: "#0f766e",
    pose: "walking",
    facing: "left",
    archetype: "staff",
    outfit: "teal-staff",
  },
  {
    id: "walker-b",
    name: "访客",
    x: 816,
    y: 214,
    tooltip: "刚从休息区路过",
    color: "#334155",
    pose: "talking",
    facing: "left",
    archetype: "visitor",
    outfit: "gray-visitor",
  },
],
```

And for the agents:

```ts
{
  id: "browser-agent",
  label: "Browser",
  badgeNum: 1,
  x: 196,
  y: 246,
  tooltip: "正在整理方案...",
  shirtColor: "#3b82f6",
  hairColor: "#92400e",
  statusIcon: "search",
  seated: true,
  pose: "focus",
  facing: "right",
  archetype: "maker",
  outfit: "blue-shirt",
},
{
  id: "coding-agent",
  label: "Coder",
  badgeNum: 2,
  x: 332,
  y: 246,
  tooltip: "正在实现界面...",
  shirtColor: "#22c55e",
  hairColor: "#1e293b",
  statusIcon: "ok",
  seated: true,
  pose: "typing",
  facing: "left",
  archetype: "maker",
  outfit: "green-jacket",
},
{
  id: "files-agent",
  label: "Files",
  badgeNum: 3,
  x: 196,
  y: 344,
  tooltip: "正在整理文件...",
  shirtColor: "#a855f7",
  hairColor: "#78350f",
  statusIcon: "notify",
  seated: true,
  pose: "focus",
  facing: "right",
  archetype: "operator",
  outfit: "purple-shirt",
},
{
  id: "ops-agent",
  label: "Ops",
  badgeNum: 4,
  x: 332,
  y: 344,
  tooltip: "正在关注异常提醒...",
  shirtColor: "#f97316",
  hairColor: "#7c2d12",
  statusIcon: "warning",
  seated: true,
  pose: "typing",
  facing: "left",
  archetype: "operator",
  outfit: "orange-jacket",
},
{
  id: "focus-agent",
  label: "Lead",
  badgeNum: 5,
  x: 512,
  y: 426,
  tooltip: "正在协调任务...",
  shirtColor: "#2563eb",
  hairColor: "#6b21a8",
  seated: false,
  pose: "standing",
  facing: "down",
  archetype: "lead",
  outfit: "navy-lead",
},
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter web exec vitest run src/components/world/zone-config.test.ts`

Expected: PASS with both `workstations` contract tests green.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/world/zone-config.ts apps/web/src/components/world/zone-config.test.ts
git commit -m "test: lock third-round office character contract"
```

### Task 2: Extract Mature Character Rendering Into A Dedicated Helper

**Files:**
- Create: `apps/web/src/components/world/workstations-characters.test.ts`
- Create: `apps/web/src/components/world/workstations-characters.ts`
- Test: `apps/web/src/components/world/workstations-characters.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/components/world/workstations-characters.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildCharacterRenderSpec } from "./workstations-characters";
import type { AgentDef } from "./zone-config";

const lead: AgentDef = {
  id: "focus-agent",
  label: "Lead",
  badgeNum: 5,
  x: 512,
  y: 426,
  tooltip: "正在协调任务...",
  shirtColor: "#2563eb",
  hairColor: "#6b21a8",
  seated: false,
  pose: "standing",
  facing: "down",
  archetype: "lead",
  outfit: "navy-lead",
};

describe("buildCharacterRenderSpec", () => {
  it("returns mature office proportions for the lead character", () => {
    const spec = buildCharacterRenderSpec(lead);

    expect(spec.headRadius).toBe(6);
    expect(spec.bodyWidth).toBe(14);
    expect(spec.legHeight).toBe(11);
    expect(spec.jacket).toBe(true);
    expect(spec.lanyard).toBe(true);
    expect(spec.shadowWidth).toBe(20);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web exec vitest run src/components/world/workstations-characters.test.ts`

Expected: FAIL because `workstations-characters.ts` does not exist.

- [ ] **Step 3: Write minimal implementation**

Create `apps/web/src/components/world/workstations-characters.ts`:

```ts
import type { AgentDef, NpcDef, OfficeOutfit } from "./zone-config";

export type CharacterRenderSpec = {
  headRadius: number;
  bodyWidth: number;
  bodyHeight: number;
  legHeight: number;
  armReach: number;
  shadowWidth: number;
  jacket: boolean;
  lanyard: boolean;
};

function outfitFlags(outfit: OfficeOutfit | undefined) {
  return {
    jacket: outfit === "green-jacket" || outfit === "orange-jacket" || outfit === "navy-lead",
    lanyard: outfit === "navy-lead" || outfit === "teal-staff",
  };
}

export function buildCharacterRenderSpec(actor: AgentDef | NpcDef): CharacterRenderSpec {
  const flags = outfitFlags(actor.outfit);

  return {
    headRadius: actor.archetype === "lead" ? 6 : 5,
    bodyWidth: actor.archetype === "lead" ? 14 : 13,
    bodyHeight: actor.pose === "walking" ? 15 : 14,
    legHeight: actor.pose === "walking" ? 12 : 11,
    armReach: actor.pose === "typing" || actor.pose === "focus" ? 5 : 4,
    shadowWidth: actor.pose === "walking" ? 22 : 20,
    jacket: flags.jacket,
    lanyard: flags.lanyard,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter web exec vitest run src/components/world/workstations-characters.test.ts`

Expected: PASS with `1 passed`.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/world/workstations-characters.ts apps/web/src/components/world/workstations-characters.test.ts
git commit -m "test: add mature office character render specs"
```

### Task 3: Rebuild The Character Drawing Layer Around The New Specs

**Files:**
- Modify: `apps/web/src/components/world/phaser-scene.test.ts`
- Modify: `apps/web/src/components/world/phaser-scene.ts`
- Create or reuse: `apps/web/src/components/world/workstations-characters.ts`
- Test: `apps/web/src/components/world/phaser-scene.test.ts`
- Test: `apps/web/src/components/world/workstations-characters.test.ts`

- [ ] **Step 1: Write the failing test**

Extend `apps/web/src/components/world/phaser-scene.test.ts`:

```ts
it("returns a tighter third-round composition for the workstation island", () => {
  const layout = buildWorkstationsLayout(960, 540);

  expect(layout.doubleDeskAnchors).toEqual([
    { x: 190, y: 236 },
    { x: 340, y: 228 },
    { x: 184, y: 340 },
    { x: 336, y: 334 },
  ]);
  expect(layout.multiScreenDesk).toEqual({ x: 170, y: 420 });
  expect(layout.focusDesk).toEqual({ x: 512, y: 416 });
  expect(layout.cameraZoom).toBe(1.16);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web exec vitest run src/components/world/phaser-scene.test.ts`

Expected: FAIL because the current second-round layout is still more rigid and uses `cameraZoom: 1.12`.

- [ ] **Step 3: Write minimal implementation**

First update the layout helper in `apps/web/src/components/world/phaser-scene.ts`:

```ts
export function buildWorkstationsLayout(vw: number, _vh: number): WorkstationsLayout {
  return {
    wallBand: { x: 48, y: 36, width: 864, height: 76 },
    doubleDeskAnchors: [
      { x: 190, y: 236 },
      { x: 340, y: 228 },
      { x: 184, y: 340 },
      { x: 336, y: 334 },
    ],
    multiScreenDesk: { x: 170, y: 420 },
    focusDesk: { x: 512, y: 416 },
    loungeRect: { x: 592, y: 262, width: 282, height: 214 },
    walkerAnchors: [
      { x: 736, y: 194 },
      { x: 812, y: 222 },
    ],
    cameraZoom: 1.16,
  };
}
```

Then import the new helper:

```ts
import {
  buildCharacterRenderSpec,
} from "./workstations-characters";
```

Refactor the body of `drawAgents()` so it uses the render spec instead of hard-coded second-round values:

```ts
const spec = buildCharacterRenderSpec(agent);

g.fillStyle(0x000000, 0.18);
g.fillEllipse(x, y + 14, spec.shadowWidth, 7);

g.fillStyle(shirtC, 1);
g.fillRect(x - spec.bodyWidth / 2, y - 15, spec.bodyWidth, spec.bodyHeight);

g.fillStyle(0xfde68a, 1);
g.fillCircle(x + fx * 1.5, y - 22, spec.headRadius);

if (spec.jacket) {
  g.fillStyle(0x1f2937, 0.55);
  g.fillRect(x - spec.bodyWidth / 2, y - 15, 4, spec.bodyHeight);
}

if (spec.lanyard) {
  g.fillStyle(0xf8fafc, 0.9);
  g.fillRect(x - 1, y - 13, 2, 7);
}
```

Add a helper to distinguish `focus` from `typing`:

```ts
function drawDeskArms(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  pose: AgentDef["pose"],
) {
  g.fillStyle(0xfde68a, 1);

  if (pose === "focus") {
    g.fillRect(x - 9, y - 12, 3, 5);
    g.fillRect(x + 6, y - 8, 3, 4);
    return;
  }

  if (pose === "typing") {
    g.fillRect(x - 12, y - 11, 4, 7);
    g.fillRect(x + 8, y - 9, 4, 6);
    return;
  }

  g.fillRect(x - 10, y - 10, 3, 8);
  g.fillRect(x + 7, y - 8, 3, 8);
}
```

Then call it from `drawAgents()`:

```ts
drawDeskArms(g, x, y, agent.pose);
```

Apply the same render-spec pattern to `drawNPCs()`:

```ts
const spec = buildCharacterRenderSpec(npc);
g.fillEllipse(x, y + 14, spec.shadowWidth, 7);
g.fillRect(x - spec.bodyWidth / 2, y - 12, spec.bodyWidth, spec.bodyHeight);
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
pnpm --filter web exec vitest run \
  src/components/world/workstations-characters.test.ts \
  src/components/world/phaser-scene.test.ts
```

Expected: PASS for both files.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/world/workstations-characters.ts apps/web/src/components/world/workstations-characters.test.ts apps/web/src/components/world/phaser-scene.ts apps/web/src/components/world/phaser-scene.test.ts
git commit -m "feat: upgrade office character drawing layer"
```

### Task 4: Polish The Scene Layout, Lounge, And Wall System Around The New Characters

**Files:**
- Modify: `apps/web/src/components/world/phaser-scene.ts`
- Modify: `apps/web/src/components/world/phaser-scene.test.ts`
- Test: `apps/web/src/components/world/phaser-scene.test.ts`
- Regression: `apps/web/src/components/world/zone-config.test.ts`
- Regression: `apps/web/src/components/world/world-shell.test.tsx`

- [ ] **Step 1: Write the failing test**

Add a second third-round layout regression to `apps/web/src/components/world/phaser-scene.test.ts`:

```ts
it("reserves a larger lounge and wall system for the third-round polish", () => {
  const layout = buildWorkstationsLayout(960, 540);

  expect(layout.wallBand).toEqual({ x: 48, y: 36, width: 864, height: 76 });
  expect(layout.loungeRect).toEqual({ x: 592, y: 262, width: 282, height: 214 });
  expect(layout.walkerAnchors).toEqual([
    { x: 736, y: 194 },
    { x: 812, y: 222 },
  ]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web exec vitest run src/components/world/phaser-scene.test.ts`

Expected: FAIL until all third-round layout values have been applied consistently.

- [ ] **Step 3: Write minimal implementation**

In `apps/web/src/components/world/phaser-scene.ts`, refine the pseudo-3D lounge and wall system.

Add a deeper workstation front-face helper:

```ts
function drawDeskFrontFace(s: Phaser.Scene, cx: number, cy: number) {
  const g = s.add.graphics();
  g.fillStyle(0x78350f, 1);
  g.fillRect(cx - 42, cy + 16, 84, 10);
  g.fillStyle(0x5b3417, 1);
  g.fillRect(cx - 42, cy + 24, 84, 4);
}
```

Call it for each desk anchor inside `drawReplicatedWorkstationsScene()`:

```ts
layout.doubleDeskAnchors.forEach((anchor, index) => {
  drawDeskFrontFace(scene, anchor.x * sx, anchor.y * sy);
  drawWorkstation(scene, anchor.x * sx, anchor.y * sy, seatedAgents[index]);
});
```

Strengthen the wall band rhythm:

```ts
drawWallBand(scene, layout.wallBand.x * sx, layout.wallBand.y * sy, layout.wallBand.width * sx, layout.wallBand.height * sy);
drawWallFrame(scene, 98 * sx, 74 * sy, 0xf59e0b);
drawWallFrame(scene, 154 * sx, 74 * sy, 0xef4444);
drawOfficeDisplay(scene, 324 * sx, 76 * sy, "看板");
drawPottedPlant(scene, 508 * sx, 82 * sy);
drawBookshelf(scene, 580 * sx, 84 * sy);
drawOfficeDisplay(scene, 714 * sx, 76 * sy, "报表");
drawPixelSign(scene, 826 * sx, 78 * sy, "STUDIO");
```

Expand the lounge as a grouped corner:

```ts
drawLoungeFloor(scene, layout.loungeRect.x * sx, layout.loungeRect.y * sy, layout.loungeRect.width * sx, layout.loungeRect.height * sy);
drawLoungePartition(scene, layout.loungeRect.x * sx, (layout.loungeRect.y - 18) * sy, layout.loungeRect.width * sx);
drawWaterCooler(scene, 662 * sx, 336 * sy);
drawCoffeeStation(scene, 748 * sx, 334 * sy);
drawStorageCabinet(scene, 842 * sx, 336 * sy);
drawLoungeSofa(scene, 792 * sx, 432 * sy);
drawPottedPlant(scene, 624 * sx, 332 * sy);
drawPottedPlant(scene, 676 * sx, 430 * sy);
drawPottedPlant(scene, 888 * sx, 340 * sy);
```

Tighten the camera:

```ts
if (zone.id === "workstations") {
  const layout = buildWorkstationsLayout(vw, vh);
  scene.cameras.main.setZoom(layout.cameraZoom);
  scene.cameras.main.centerOn(vw / 2, vh / 2 + 20);
}
```

- [ ] **Step 4: Run the full scene regression suite**

Run:

```bash
pnpm --filter web exec vitest run \
  src/components/world/zone-config.test.ts \
  src/components/world/workstations-characters.test.ts \
  src/components/world/phaser-scene.test.ts \
  src/components/world/world-shell.test.tsx
```

Expected: all world-scene tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/world/phaser-scene.ts apps/web/src/components/world/phaser-scene.test.ts apps/web/src/components/world/zone-config.test.ts apps/web/src/components/world/workstations-characters.test.ts
git commit -m "feat: polish third-round office scene layout"
```

### Task 5: Build And Visually Verify The Mature Character Pass

**Files:**
- Modify only if QA reveals drift: `apps/web/src/components/world/zone-config.ts`
- Modify only if QA reveals drift: `apps/web/src/components/world/workstations-characters.ts`
- Modify only if QA reveals drift: `apps/web/src/components/world/phaser-scene.ts`

- [ ] **Step 1: Run the production build**

Run: `pnpm --filter web build`

Expected: PASS with a successful production build.

- [ ] **Step 2: Start the app and inspect the `工位区`**

Run: `pnpm --filter web exec next dev --port 3201`

Then open `/`, switch to `工位区`, and verify these six points:

```txt
1. Seated workers look more like mature office staff, not marker icons
2. The lead character reads as a stronger focal point
3. The left workstation island feels less grid-like
4. The right lounge corner reads as one grouped space
5. Desk fronts, partition edges, and shadows improve pseudo-3D depth
6. The whole scene still fits the existing pixel world style
```

Expected: the scene feels like a believable office workspace rather than a functional mock layout.

- [ ] **Step 3: If one point fails, make the smallest visual correction**

Example small correction for a too-rigid desk island:

```ts
doubleDeskAnchors: [
  { x: 194, y: 236 },
  { x: 344, y: 230 },
  { x: 180, y: 342 },
  { x: 332, y: 334 },
],
```

Example small correction for a weak focal desk:

```ts
focusDesk: { x: 520, y: 416 }
```

Then rerun:

```bash
pnpm --filter web exec vitest run src/components/world/phaser-scene.test.ts
pnpm --filter web build
```

- [ ] **Step 4: Record the final state with one last regression pass**

Run:

```bash
pnpm --filter web exec vitest run \
  src/components/world/zone-config.test.ts \
  src/components/world/workstations-characters.test.ts \
  src/components/world/phaser-scene.test.ts \
  src/components/world/world-shell.test.tsx
```

Expected: PASS with a clean final regression result.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/world/zone-config.ts apps/web/src/components/world/workstations-characters.ts apps/web/src/components/world/phaser-scene.ts apps/web/src/components/world/zone-config.test.ts apps/web/src/components/world/workstations-characters.test.ts apps/web/src/components/world/phaser-scene.test.ts
git commit -m "feat: finalize third-round office polish"
```

---

## Self-Review

- Spec coverage: the plan covers the mature character pass, pose/facing refinement, outfit/archetype semantics, tighter workstation layout, stronger lounge grouping, wall-band polish, pseudo-3D desk/cabinet layering, and final build/preview validation.
- Placeholder scan: no `TODO`, `TBD`, “implement later,” or “handle appropriately” placeholders remain.
- Type consistency: `OfficeOutfit`, `OfficeArchetype`, `buildCharacterRenderSpec()`, and `buildWorkstationsLayout()` are introduced once and reused consistently across later tasks.
