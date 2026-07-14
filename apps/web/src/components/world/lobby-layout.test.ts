import { describe, expect, it } from "vitest";
import {
  buildLobbyLayout,
  footYDepth,
  validateRoutesAgainstObstacles,
} from "./lobby-layout";

describe("buildLobbyLayout", () => {
  it("defines the 960x540 lobby frame and HUD safe areas", () => {
    const layout = buildLobbyLayout();

    expect(layout.viewport).toEqual({ width: 960, height: 540 });
    expect(layout.hudSafeAreas).toEqual({ top: 56, bottom: 72 });
    expect(layout.showRouteOverlay).toBe(false);
    expect(layout.showRouteLegends).toBe(false);
  });

  it("provides reception, waiting, wayfinding, and entrance anchors", () => {
    const layout = buildLobbyLayout();

    expect(layout.zones.reception).toEqual({ x: 342, y: 132, width: 276, height: 120 });
    expect(layout.zones.waiting).toEqual({ x: 54, y: 154, width: 258, height: 232 });
    expect(layout.zones.wayfinding).toEqual({ x: 662, y: 154, width: 242, height: 236 });
    expect(Object.keys(layout.entranceAnchors)).toEqual(["north", "east", "south", "west"]);
  });

  it("keeps the primary circulation channel at least 56px wide", () => {
    const layout = buildLobbyLayout();

    expect(layout.mainCorridor.width).toBeGreaterThanOrEqual(56);
  });

  it("defines routes using existing walk nodes", () => {
    const layout = buildLobbyLayout();
    const nodeIds = new Set(layout.walkNodes.map((node) => node.id));

    expect(layout.walkRoutes.length).toBeGreaterThanOrEqual(5);
    for (const route of layout.walkRoutes) {
      expect(route.nodeIds.length).toBeGreaterThanOrEqual(2);
      expect(route.nodeIds.every((nodeId) => nodeIds.has(nodeId))).toBe(true);
    }
  });

  it("keeps every route outside obstacles inflated by 12px", () => {
    const layout = buildLobbyLayout();

    expect(validateRoutesAgainstObstacles(layout, 12)).toEqual([]);
  });
});

describe("footYDepth", () => {
  it("sorts actors by foot position with an optional stable offset", () => {
    expect(footYDepth(240)).toBe(3400);
    expect(footYDepth(240, 7)).toBe(3407);
    expect(footYDepth(241)).toBeGreaterThan(footYDepth(240, 7));
  });
});
