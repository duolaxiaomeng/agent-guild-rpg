import { describe, expect, it } from "vitest";
import {
  COLLAB_ROOM_DEPTHS,
  COLLAB_ROOM_SEAT_FACING,
  COLLAB_ROOM_STATUS_MAP,
  buildCollabRoomLayout,
  buildCollabRoomVisualConfig,
  buildCollabRoomWalkGraph,
  type CollabRoomObstacle,
  type CollabRoomWalkNode,
} from "./collab-room-layout";

function segmentCrossesObstacle(
  from: CollabRoomWalkNode,
  to: CollabRoomWalkNode,
  obstacle: CollabRoomObstacle,
): boolean {
  const left = obstacle.x;
  const right = obstacle.x + obstacle.width;
  const top = obstacle.y;
  const bottom = obstacle.y + obstacle.height;

  if (from.x === to.x) {
    return from.x > left && from.x < right
      && Math.max(from.y, to.y) > top
      && Math.min(from.y, to.y) < bottom;
  }
  if (from.y === to.y) {
    return from.y > top && from.y < bottom
      && Math.max(from.x, to.x) > left
      && Math.min(from.x, to.x) < right;
  }

  throw new Error(`Route segment ${from.id} -> ${to.id} must be axis-aligned`);
}

describe("buildCollabRoomLayout", () => {
  it("defines the complete 960x540 collaboration room", () => {
    const layout = buildCollabRoomLayout(960, 540);

    expect(layout.viewport).toEqual({ width: 960, height: 540 });
    expect(layout.hudSafeAreas).toEqual({ top: 56, bottom: 72 });
    expect(layout.roomRect).toEqual({ x: 24, y: 24, width: 912, height: 492 });
    expect(layout.whiteboardRect).toEqual({ x: 292, y: 64, width: 376, height: 72 });
    expect(layout.roundTableObstacle).toEqual({
      id: "round-table",
      x: 350,
      y: 202,
      width: 260,
      height: 156,
    });
    expect(layout.materialsRect).toEqual({ x: 704, y: 142, width: 178, height: 222 });
    expect(layout.entrance).toEqual({ x: 480, y: 492, width: 112, height: 24 });
  });

  it("places three back seats and three front seats around the table", () => {
    const { seats } = buildCollabRoomLayout(960, 540);

    expect(seats.map(({ id }) => id)).toEqual([
      "seat-back-left",
      "seat-back-center",
      "seat-back-right",
      "seat-front-left",
      "seat-front-center",
      "seat-front-right",
    ]);
    expect(seats.filter(({ row }) => row === "back")).toHaveLength(3);
    expect(seats.filter(({ row }) => row === "front")).toHaveLength(3);
    expect(seats.filter(({ row }) => row === "back").every(({ facing }) => facing === "front")).toBe(true);
    expect(seats.filter(({ row }) => row === "front").every(({ facing }) => facing === "back")).toBe(true);
  });

  it("exports stable depth and avatar-status presentation rules", () => {
    expect(COLLAB_ROOM_SEAT_FACING).toEqual({ back: "front", front: "back" });
    expect(COLLAB_ROOM_DEPTHS).toEqual({
      room: 0,
      wallFixtures: 2,
      backSeats: 3,
      table: 4,
      actors: 5,
      frontSeats: 6,
      labels: 8,
    });
    expect(COLLAB_ROOM_STATUS_MAP).toEqual({
      working: { tone: "blue", label: "协作中", activity: "active" },
      reviewing: { tone: "amber", label: "评审中", activity: "active" },
      online: { tone: "green", label: "在线", activity: "available" },
      idle: { tone: "gray", label: "空闲", activity: "available" },
      offline: { tone: "slate", label: "离线", activity: "inactive" },
    });
  });
});

describe("buildCollabRoomWalkGraph", () => {
  it("connects the entrance, seats, whiteboard and materials without crossing the table", () => {
    const graph = buildCollabRoomWalkGraph(960, 540);
    const nodes = new Map(graph.nodes.map((node) => [node.id, node]));

    expect(graph.obstacles).toEqual([
      { id: "round-table", x: 350, y: 202, width: 260, height: 156 },
    ]);
    expect(graph.routes.map(({ id }) => id)).toEqual([
      "entrance-to-back-seats",
      "entrance-to-front-seats",
      "entrance-to-whiteboard",
      "entrance-to-materials",
    ]);

    for (const route of graph.routes) {
      expect(route.nodeIds[0]).toBe("entrance");
      for (let index = 1; index < route.nodeIds.length; index += 1) {
        const from = nodes.get(route.nodeIds[index - 1]);
        const to = nodes.get(route.nodeIds[index]);
        expect(from, `Missing node ${route.nodeIds[index - 1]}`).toBeDefined();
        expect(to, `Missing node ${route.nodeIds[index]}`).toBeDefined();
        expect(segmentCrossesObstacle(from!, to!, graph.obstacles[0])).toBe(false);
      }
    }
  });

  it("scales coordinates from the 960x540 baseline", () => {
    const graph = buildCollabRoomWalkGraph(480, 270);

    expect(graph.nodes.find(({ id }) => id === "entrance")).toEqual({
      id: "entrance",
      x: 240,
      y: 246,
    });
    expect(graph.obstacles[0]).toEqual({
      id: "round-table",
      x: 175,
      y: 101,
      width: 130,
      height: 78,
    });
  });
});

describe("buildCollabRoomVisualConfig", () => {
  it("keeps route debugging overlays hidden", () => {
    expect(buildCollabRoomVisualConfig()).toEqual({
      showRouteOverlay: false,
      showRouteLegends: false,
    });
  });
});
