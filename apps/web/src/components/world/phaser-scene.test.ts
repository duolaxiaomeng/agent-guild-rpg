import { describe, expect, it, vi } from "vitest";
import { T, ZONE_DEFS } from "./zone-config";
import {
  buildOfficeTilesForZone,
  buildWorkstationTextureManifest,
  buildWorkstationVisualConfig,
  buildWorkstationsLayout,
  buildWorkstationsWalkGraph,
  buildWorldPostBoot,
  resolveActorLayering,
  shouldRebuildSceneForResize,
} from "./phaser-scene";

describe("buildWorldPostBoot", () => {
  it("starts the initial scene only after Phaser finishes booting", () => {
    const start = vi.fn();
    const postBoot = buildWorldPostBoot("lobby");

    postBoot({ scene: { start } });

    expect(start).toHaveBeenCalledWith("lobby");
  });
});

describe("buildWorkstationsLayout", () => {
  it("returns the office composition anchors from the reference", () => {
    const layout = buildWorkstationsLayout(960, 540);

    expect(layout.roomRect).toEqual({ x: 22, y: 28, width: 916, height: 486 });
    expect(layout.wallBand).toEqual({ x: 88, y: 44, width: 704, height: 76 });
    expect(layout.doubleDeskAnchors).toEqual([
      { x: 122, y: 214 },
      { x: 316, y: 214 },
      { x: 122, y: 348 },
      { x: 316, y: 348 },
    ]);
    expect(layout.focusDesk).toEqual({ x: 482, y: 454 });
    expect(layout.loungeRect).toEqual({ x: 568, y: 120, width: 334, height: 300 });
    expect(layout.corridorRect).toEqual({ x: 406, y: 122, width: 140, height: 348 });
    expect(layout.reviewRoom).toEqual({ x: 748, y: 382, width: 142, height: 112 });
    expect(layout.reviewDoor).toEqual({ x: 820, y: 438 });
    expect(layout.taskBoard).toEqual({ x: 340, y: 72 });
    expect(layout.topPanels.map((panel) => panel.id)).toEqual([
      "agent-guild",
      "task-board",
      "status",
      "announcement",
    ]);
    expect(layout.routeLegend).toEqual({ x: 804, y: 142, width: 122, height: 100 });
    expect(layout.behaviorLegend).toEqual({ x: 42, y: 406, width: 156, height: 92 });
    expect(layout.walkerAnchors).toEqual([
      { x: 468, y: 142 },
      { x: 590, y: 248 },
    ]);
    expect(layout.cameraZoom).toBe(1.08);
  });
});

describe("buildWorkstationTextureManifest", () => {
  it("declares the generated sprite textures used by the reference workstation scene", () => {
    const manifest = buildWorkstationTextureManifest();

    expect(manifest.furniture).toEqual([
      "desk-single",
      "desk-lead",
      "lounge-sofa",
      "coffee-counter",
      "water-cooler",
      "review-door",
    ]);
    expect(manifest.characters).toEqual([
      "agent-seated-blue-shirt",
      "agent-seated-green-jacket",
      "agent-seated-purple-shirt",
      "agent-seated-orange-jacket",
      "agent-seated-navy-lead",
      "npc-walking-teal-staff",
      "npc-walking-gray-visitor",
    ]);
  });
});

describe("buildWorkstationVisualConfig", () => {
  it("keeps routes functional without drawing route guides", () => {
    expect(buildWorkstationVisualConfig()).toEqual({
      showRouteOverlay: false,
      showRouteLegends: false,
    });
  });
});

describe("buildWorkstationsWalkGraph", () => {
  it("defines stable walkable nodes and obstacle rectangles for the office", () => {
    const graph = buildWorkstationsWalkGraph(960, 540);

    expect(graph.nodes.map((node) => node.id)).toEqual([
      "browser-desk",
      "coder-desk",
      "files-desk",
      "ops-desk",
      "browser-aisle",
      "coder-aisle",
      "workstation-aisle-east",
      "lead-station",
      "task-board",
      "main-corridor-north",
      "main-corridor-mid",
      "main-corridor-south",
      "lounge-entry",
      "coffee-counter",
      "review-door",
      "display-wall",
      "guild-sign",
      "announcement-panel",
    ]);
    expect(graph.obstacles).toEqual([
      { id: "desk-cluster-a", x: 76, y: 164, width: 296, height: 254 },
      { id: "lead-desk", x: 396, y: 420, width: 168, height: 76 },
      { id: "lounge-block", x: 568, y: 120, width: 334, height: 300 },
      { id: "review-room", x: 748, y: 382, width: 142, height: 112 },
    ]);
    expect(graph.nodes.find((node) => node.id === "coffee-counter")).toEqual({
      id: "coffee-counter",
      x: 744,
      y: 356,
    });
  });

  it("defines deterministic movement routes that use valid nodes", () => {
    const graph = buildWorkstationsWalkGraph(960, 540);
    const nodeIds = new Set(graph.nodes.map((node) => node.id));

    expect(graph.routes.map((route) => route.id)).toEqual([
      "browser-board-loop",
      "coder-board-loop",
      "files-lounge-loop",
      "ops-review-loop",
      "lead-review-loop",
      "staff-patrol-loop",
      "visitor-lounge-loop",
    ]);
    expect(graph.routes.find((route) => route.id === "coder-board-loop")?.nodeIds).toEqual([
      "coder-desk",
      "coder-aisle",
      "workstation-aisle-east",
      "main-corridor-mid",
      "main-corridor-north",
      "task-board",
      "main-corridor-north",
      "main-corridor-mid",
      "workstation-aisle-east",
      "coder-aisle",
      "coder-desk",
    ]);
    expect(
      graph.routes.every((route) =>
        route.nodeIds.every((nodeId) => nodeIds.has(nodeId)),
      ),
    ).toBe(true);
  });
});

describe("resolveActorLayering", () => {
  it("keeps overlays visible and follows moving actors in dedicated rooms", () => {
    expect(resolveActorLayering("collab-room", 320, 58)).toEqual({
      actorDepth: 420,
      auraDepth: 419,
      bubbleDepth: 1000,
      labelY: 262,
    });
  });

  it("sorts workstation walkers without escaping the workstation depth band", () => {
    const north = resolveActorLayering("workstations", 140, 58);
    const south = resolveActorLayering("workstations", 420, 58);

    expect(north.actorDepth).toBeLessThan(south.actorDepth);
    expect(north.actorDepth).toBeGreaterThan(4);
    expect(south.actorDepth).toBeLessThan(6);
    expect(south.labelY).toBe(362);
  });
});

describe("shouldRebuildSceneForResize", () => {
  it("rebuilds dedicated scene coordinates only when the viewport changes", () => {
    expect(shouldRebuildSceneForResize({ width: 960, height: 540 }, { width: 960, height: 540 })).toBe(false);
    expect(shouldRebuildSceneForResize({ width: 960, height: 540 }, { width: 720, height: 540 })).toBe(true);
    expect(shouldRebuildSceneForResize({ width: 960, height: 540 }, { width: 960, height: 720 })).toBe(true);
  });
});

describe("buildOfficeTilesForZone", () => {
  it("uses gray tile workspace with a wood lounge for workstations", () => {
    const zone = ZONE_DEFS.find((item) => item.id === "workstations")!;
    const data = buildOfficeTilesForZone(48, 30, zone, 960, 540);

    expect(data[2][8]).toBe(T.FLOOR + 1);
    expect(data[12][9]).toBe(T.STONE + 1);
    expect(data[23][36]).toBe(T.WOOD + 1);
    expect(data[23][42]).toBe(T.WOOD_ALT + 1);
  });

  it("uses a dedicated lobby floor instead of the generic cross paths", () => {
    const zone = ZONE_DEFS.find((item) => item.id === "lobby")!;
    const data = buildOfficeTilesForZone(48, 30, zone, 960, 540);

    expect(data[4][4]).toBe(T.FLOOR + 1);
    expect(data[12][6]).toBe(T.WOOD + 1);
    expect(data[20][24]).toBe(T.STONE + 1);
    expect(data[20][40]).toBe(T.FLOOR + 1);
  });

  it("uses a continuous collaboration floor with one meeting rug", () => {
    const zone = ZONE_DEFS.find((item) => item.id === "collab-room")!;
    const data = buildOfficeTilesForZone(48, 30, zone, 960, 540);

    expect(data[5][5]).toBe(T.WOOD + 1);
    expect(data[17][22]).toBe(T.FLOOR + 1);
    expect(data[17][8]).toBe(T.WOOD_ALT + 1);
    expect(data[26][22]).toBe(T.WOOD + 1);
  });

  it("uses a narrow review aisle without route-like floor grids", () => {
    const zone = ZONE_DEFS.find((item) => item.id === "review-station")!;
    const data = buildOfficeTilesForZone(48, 30, zone, 960, 540);

    expect(data[8][8]).toBe(T.STONE + 1);
    expect(data[24][23]).toBe(T.ROAD_ALT + 1);
    expect(data[24][12]).toBe(T.STONE_ALT + 1);
    expect(data[24][36]).toBe(T.STONE + 1);
  });
});
