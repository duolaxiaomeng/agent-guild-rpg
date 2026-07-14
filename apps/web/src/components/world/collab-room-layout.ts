import { scaleHudSafeAreas } from "./world-hud";

export type CollabRoomAvatarStatus =
  | "working"
  | "reviewing"
  | "online"
  | "idle"
  | "offline";

export type CollabRoomSeatRow = "back" | "front";
export type CollabRoomSeatFacing = "back" | "front";

export type CollabRoomRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type CollabRoomSeat = {
  id: string;
  row: CollabRoomSeatRow;
  x: number;
  y: number;
  facing: CollabRoomSeatFacing;
  depth: number;
};

export type CollabRoomObstacle = CollabRoomRect & {
  id: string;
};

export type CollabRoomWalkNode = {
  id: string;
  x: number;
  y: number;
};

export type CollabRoomWalkRoute = {
  id: string;
  nodeIds: string[];
};

export type CollabRoomWalkGraph = {
  nodes: CollabRoomWalkNode[];
  routes: CollabRoomWalkRoute[];
  obstacles: CollabRoomObstacle[];
};

export const COLLAB_ROOM_SEAT_FACING: Record<CollabRoomSeatRow, CollabRoomSeatFacing> = {
  back: "front",
  front: "back",
};

export const COLLAB_ROOM_DEPTHS = {
  room: 0,
  wallFixtures: 2,
  backSeats: 3,
  table: 4,
  actors: 5,
  frontSeats: 6,
  labels: 8,
} as const;

export const COLLAB_ROOM_STATUS_MAP = {
  working: { tone: "blue", label: "协作中", activity: "active" },
  reviewing: { tone: "amber", label: "评审中", activity: "active" },
  online: { tone: "green", label: "在线", activity: "available" },
  idle: { tone: "gray", label: "空闲", activity: "available" },
  offline: { tone: "slate", label: "离线", activity: "inactive" },
} as const satisfies Record<
  CollabRoomAvatarStatus,
  { tone: string; label: string; activity: "active" | "available" | "inactive" }
>;

export type CollabRoomLayout = {
  viewport: { width: number; height: number };
  hudSafeAreas: { top: number; bottom: number };
  roomRect: CollabRoomRect;
  whiteboardRect: CollabRoomRect;
  roundTableObstacle: CollabRoomObstacle;
  seats: CollabRoomSeat[];
  materialsRect: CollabRoomRect;
  entrance: CollabRoomRect;
};

function scaleValue(value: number, scale: number): number {
  return Math.round(value * scale);
}

function scaleRect(rect: CollabRoomRect, scaleX: number, scaleY: number): CollabRoomRect {
  return {
    x: scaleValue(rect.x, scaleX),
    y: scaleValue(rect.y, scaleY),
    width: scaleValue(rect.width, scaleX),
    height: scaleValue(rect.height, scaleY),
  };
}

export function buildCollabRoomLayout(viewportWidth: number, viewportHeight: number): CollabRoomLayout {
  const scaleX = viewportWidth / 960;
  const scaleY = viewportHeight / 540;
  const seat = (
    id: string,
    row: CollabRoomSeatRow,
    x: number,
    y: number,
  ): CollabRoomSeat => ({
    id,
    row,
    x: scaleValue(x, scaleX),
    y: scaleValue(y, scaleY),
    facing: COLLAB_ROOM_SEAT_FACING[row],
    depth: row === "back" ? COLLAB_ROOM_DEPTHS.backSeats : COLLAB_ROOM_DEPTHS.frontSeats,
  });

  return {
    viewport: { width: viewportWidth, height: viewportHeight },
    hudSafeAreas: scaleHudSafeAreas(viewportHeight),
    roomRect: scaleRect({ x: 24, y: 24, width: 912, height: 492 }, scaleX, scaleY),
    whiteboardRect: scaleRect({ x: 292, y: 64, width: 376, height: 72 }, scaleX, scaleY),
    roundTableObstacle: {
      id: "round-table",
      ...scaleRect({ x: 350, y: 202, width: 260, height: 156 }, scaleX, scaleY),
    },
    seats: [
      seat("seat-back-left", "back", 400, 170),
      seat("seat-back-center", "back", 480, 170),
      seat("seat-back-right", "back", 560, 170),
      seat("seat-front-left", "front", 400, 390),
      seat("seat-front-center", "front", 480, 390),
      seat("seat-front-right", "front", 560, 390),
    ],
    materialsRect: scaleRect({ x: 704, y: 142, width: 178, height: 222 }, scaleX, scaleY),
    entrance: scaleRect({ x: 480, y: 492, width: 112, height: 24 }, scaleX, scaleY),
  };
}

export function buildCollabRoomWalkGraph(
  viewportWidth: number,
  viewportHeight: number,
): CollabRoomWalkGraph {
  const scaleX = viewportWidth / 960;
  const scaleY = viewportHeight / 540;
  const node = (id: string, x: number, y: number): CollabRoomWalkNode => ({
    id,
    x: scaleValue(x, scaleX),
    y: scaleValue(y, scaleY),
  });
  const obstacle: CollabRoomObstacle = {
    id: "round-table",
    ...scaleRect({ x: 350, y: 202, width: 260, height: 156 }, scaleX, scaleY),
  };

  return {
    nodes: [
      node("entrance", 480, 492),
      node("south-center", 480, 390),
      node("south-left", 320, 390),
      node("south-right", 640, 390),
      node("west-upper", 320, 170),
      node("east-upper", 640, 170),
      node("seat-back-left", 400, 170),
      node("seat-back-center", 480, 170),
      node("seat-back-right", 560, 170),
      node("seat-front-left", 400, 390),
      node("seat-front-center", 480, 390),
      node("seat-front-right", 560, 390),
      node("whiteboard-left", 320, 132),
      node("whiteboard-center", 480, 132),
      node("materials-lower", 680, 390),
      node("materials-upper", 680, 170),
      node("materials", 790, 170),
    ],
    routes: [
      {
        id: "entrance-to-back-seats",
        nodeIds: [
          "entrance",
          "south-center",
          "south-left",
          "west-upper",
          "seat-back-left",
          "seat-back-center",
          "seat-back-right",
        ],
      },
      {
        id: "entrance-to-front-seats",
        nodeIds: [
          "entrance",
          "south-center",
          "seat-front-center",
          "seat-front-left",
          "seat-front-center",
          "seat-front-right",
        ],
      },
      {
        id: "entrance-to-whiteboard",
        nodeIds: [
          "entrance",
          "south-center",
          "south-left",
          "west-upper",
          "whiteboard-left",
          "whiteboard-center",
        ],
      },
      {
        id: "entrance-to-materials",
        nodeIds: [
          "entrance",
          "south-center",
          "south-right",
          "materials-lower",
          "materials-upper",
          "materials",
        ],
      },
    ],
    obstacles: [obstacle],
  };
}

export function buildCollabRoomVisualConfig() {
  return {
    showRouteOverlay: false,
    showRouteLegends: false,
  } as const;
}
