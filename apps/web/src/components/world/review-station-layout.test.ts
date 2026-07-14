import { describe, expect, it } from "vitest";
import {
  REVIEW_DECISION_VISUALS,
  REVIEW_STATION_DEPTHS,
  REVIEW_STATUS_VISUALS,
  buildReviewStationLayout,
  buildReviewStationVisualConfig,
  buildReviewStationWalkGraph,
} from "./review-station-layout";

describe("buildReviewStationLayout", () => {
  it("defines the 960x540 review room composition outside the HUD safe area", () => {
    const layout = buildReviewStationLayout(960, 540);

    expect(layout.hudSafeAreas).toEqual({ top: 56, bottom: 72 });
    expect(layout.hudSafeArea).toEqual({ x: 24, y: 56, width: 912, height: 412 });
    expect(layout.statusScreen).toEqual({ x: 480, y: 116 });
    expect(layout.decisionDesk).toEqual({ x: 480, y: 260 });
    expect(layout.waitingAnchors).toEqual([
      { x: 174, y: 220 },
      { x: 174, y: 300 },
      { x: 786, y: 220 },
      { x: 786, y: 300 },
    ]);
    expect(layout.qualityTerminal).toEqual({ x: 788, y: 428 });
    expect(layout.presentationSpot).toEqual({ x: 480, y: 352 });
    expect(layout.entrance).toEqual({ x: 480, y: 452 });

    const points = [
      layout.statusScreen,
      layout.decisionDesk,
      ...layout.waitingAnchors,
      layout.qualityTerminal,
      layout.presentationSpot,
      layout.entrance,
    ];
    expect(
      points.every(
        ({ x, y }) =>
          x >= layout.hudSafeArea.x &&
          x <= layout.hudSafeArea.x + layout.hudSafeArea.width &&
          y >= layout.hudSafeArea.y &&
          y <= layout.hudSafeArea.y + layout.hudSafeArea.height,
      ),
    ).toBe(true);
  });

  it("scales every layout coordinate from the 960x540 baseline", () => {
    const layout = buildReviewStationLayout(480, 270);

    expect(layout.hudSafeArea).toEqual({ x: 12, y: 28, width: 456, height: 206 });
    expect(layout.decisionDesk).toEqual({ x: 240, y: 130 });
    expect(layout.waitingAnchors[3]).toEqual({ x: 393, y: 150 });
    expect(layout.entrance).toEqual({ x: 240, y: 226 });
  });
});

describe("review station navigation", () => {
  it("defines obstacles and one deterministic walk route through valid nodes", () => {
    const graph = buildReviewStationWalkGraph(960, 540);
    const nodeIds = new Set(graph.nodes.map(({ id }) => id));

    expect(graph.obstacles).toEqual([
      { id: "status-screen", x: 326, y: 64, width: 308, height: 104 },
      { id: "decision-desk", x: 344, y: 174, width: 272, height: 150 },
      { id: "waiting-left", x: 72, y: 178, width: 182, height: 212 },
      { id: "waiting-right", x: 706, y: 178, width: 182, height: 212 },
      { id: "quality-terminal", x: 692, y: 392, width: 192, height: 72 },
    ]);
    expect(graph.routes).toEqual([
      {
        id: "reviewer-station-loop",
        nodeIds: [
          "entrance",
          "presentation-spot",
          "decision-desk-front",
          "quality-terminal-front",
          "decision-desk-front",
          "presentation-spot",
          "entrance",
        ],
      },
    ]);
    expect(graph.routes[0].nodeIds.every((id) => nodeIds.has(id))).toBe(true);
  });

  it("keeps route overlays disabled", () => {
    expect(buildReviewStationVisualConfig()).toEqual({ showRouteOverlay: false });
  });
});

describe("review station visual rules", () => {
  it("maps every review status and teacher decision to a stable visual state", () => {
    expect(REVIEW_STATUS_VISUALS).toEqual({
      queued: { tone: "pending", color: "#f59e0b", icon: "hourglass", label: "排队中" },
      ai_reviewed: { tone: "reviewed", color: "#38bdf8", icon: "scan", label: "AI 已评审" },
      teacher_decided: { tone: "decided", color: "#22c55e", icon: "stamp", label: "老师已裁定" },
    });
    expect(REVIEW_DECISION_VISUALS).toEqual({
      approve: { tone: "success", color: "#22c55e", icon: "check", label: "通过" },
      adjust: { tone: "warning", color: "#f59e0b", icon: "edit", label: "调整" },
      reject: { tone: "danger", color: "#ef4444", icon: "cross", label: "退回" },
    });
  });

  it("keeps room, obstacles, actors, effects and HUD in deterministic depth order", () => {
    expect(REVIEW_STATION_DEPTHS).toEqual({
      room: 0,
      floorMarks: 1,
      obstacles: 3,
      actors: 4,
      effects: 5,
      labels: 6,
      hud: 10,
    });
  });
});
