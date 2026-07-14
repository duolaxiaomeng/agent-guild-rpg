import { WORLD_HUD_SAFE_AREAS } from "./world-hud";

export type LobbyPoint = {
  x: number;
  y: number;
};

export type LobbyRect = LobbyPoint & {
  width: number;
  height: number;
};

export type LobbyWalkNode = LobbyPoint & {
  id: string;
};

export type LobbyWalkRoute = {
  id: string;
  nodeIds: string[];
};

export type LobbyObstacle = LobbyRect & {
  id: string;
};

export type LobbyLayout = {
  viewport: { width: number; height: number };
  hudSafeAreas: { top: number; bottom: number };
  zones: {
    reception: LobbyRect;
    waiting: LobbyRect;
    wayfinding: LobbyRect;
  };
  entranceAnchors: {
    north: LobbyPoint;
    east: LobbyPoint;
    south: LobbyPoint;
    west: LobbyPoint;
  };
  mainCorridor: LobbyRect;
  obstacles: LobbyObstacle[];
  walkNodes: LobbyWalkNode[];
  walkRoutes: LobbyWalkRoute[];
  showRouteOverlay: false;
  showRouteLegends: false;
};

export type RouteObstacleViolation = {
  routeId: string;
  segmentIndex: number;
  fromNodeId: string;
  toNodeId: string;
  obstacleId: string;
};

const BASE_WIDTH = 960;
const BASE_HEIGHT = 540;

export function buildLobbyLayout(width = BASE_WIDTH, height = BASE_HEIGHT): LobbyLayout {
  const sx = width / BASE_WIDTH;
  const sy = height / BASE_HEIGHT;
  const point = (x: number, y: number): LobbyPoint => ({
    x: Math.round(x * sx),
    y: Math.round(y * sy),
  });
  const rect = (x: number, y: number, rectWidth: number, rectHeight: number): LobbyRect => ({
    ...point(x, y),
    width: Math.round(rectWidth * sx),
    height: Math.round(rectHeight * sy),
  });
  const node = (id: string, x: number, y: number): LobbyWalkNode => ({ id, ...point(x, y) });
  const obstacle = (
    id: string,
    x: number,
    y: number,
    obstacleWidth: number,
    obstacleHeight: number,
  ): LobbyObstacle => ({ id, ...rect(x, y, obstacleWidth, obstacleHeight) });

  return {
    viewport: { width, height },
    hudSafeAreas: {
      top: Math.round(WORLD_HUD_SAFE_AREAS.top * sy),
      bottom: Math.round(WORLD_HUD_SAFE_AREAS.bottom * sy),
    },
    zones: {
      reception: rect(342, 132, 276, 120),
      waiting: rect(54, 154, 258, 232),
      wayfinding: rect(662, 154, 242, 236),
    },
    entranceAnchors: {
      north: point(326, 270),
      east: point(920, 450),
      south: point(480, 508),
      west: point(40, 450),
    },
    mainCorridor: rect(326, 264, 328, 204),
    obstacles: [
      obstacle("waiting-seating", 54, 154, 258, 232),
      obstacle("reception-desk", 342, 132, 276, 120),
      obstacle("wayfinding-kiosk", 662, 154, 242, 236),
    ],
    walkNodes: [
      node("north-entrance", 326, 270),
      node("reception-approach", 480, 270),
      node("west-entrance", 40, 450),
      node("west-junction", 326, 450),
      node("lobby-center", 480, 450),
      node("east-junction", 648, 450),
      node("east-entrance", 920, 450),
      node("waiting-approach", 326, 400),
      node("wayfinding-approach", 648, 400),
      node("south-junction", 480, 468),
      node("south-entrance", 480, 508),
    ],
    walkRoutes: [
      {
        id: "main-crossing",
        nodeIds: ["west-entrance", "west-junction", "lobby-center", "east-junction", "east-entrance"],
      },
      {
        id: "north-to-reception",
        nodeIds: ["north-entrance", "reception-approach"],
      },
      {
        id: "waiting-access",
        nodeIds: ["lobby-center", "west-junction", "waiting-approach"],
      },
      {
        id: "wayfinding-access",
        nodeIds: ["lobby-center", "east-junction", "wayfinding-approach"],
      },
      {
        id: "south-access",
        nodeIds: ["lobby-center", "south-junction", "south-entrance"],
      },
    ],
    showRouteOverlay: false,
    showRouteLegends: false,
  };
}

export function routeSegmentIntersectsRect(
  start: LobbyPoint,
  end: LobbyPoint,
  rect: LobbyRect,
  padding = 0,
): boolean {
  const left = rect.x - padding;
  const right = rect.x + rect.width + padding;
  const top = rect.y - padding;
  const bottom = rect.y + rect.height + padding;
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  let entry = 0;
  let exit = 1;

  const clips = [
    [-dx, start.x - left],
    [dx, right - start.x],
    [-dy, start.y - top],
    [dy, bottom - start.y],
  ] as const;

  for (const [direction, distance] of clips) {
    if (direction === 0) {
      if (distance < 0) return false;
      continue;
    }

    const ratio = distance / direction;
    if (direction < 0) entry = Math.max(entry, ratio);
    else exit = Math.min(exit, ratio);
    if (entry > exit) return false;
  }

  return true;
}

export function validateRoutesAgainstObstacles(
  layout: Pick<LobbyLayout, "walkNodes" | "walkRoutes" | "obstacles">,
  padding = 12,
): RouteObstacleViolation[] {
  const nodes = new Map(layout.walkNodes.map((node) => [node.id, node]));
  const violations: RouteObstacleViolation[] = [];

  for (const route of layout.walkRoutes) {
    for (let segmentIndex = 0; segmentIndex < route.nodeIds.length - 1; segmentIndex += 1) {
      const fromNodeId = route.nodeIds[segmentIndex];
      const toNodeId = route.nodeIds[segmentIndex + 1];
      const start = nodes.get(fromNodeId);
      const end = nodes.get(toNodeId);
      if (!start || !end) continue;

      for (const obstacle of layout.obstacles) {
        if (routeSegmentIntersectsRect(start, end, obstacle, padding)) {
          violations.push({
            routeId: route.id,
            segmentIndex,
            fromNodeId,
            toNodeId,
            obstacleId: obstacle.id,
          });
        }
      }
    }
  }

  return violations;
}

export function footYDepth(footY: number, stableOffset = 0): number {
  const offset = Math.max(0, Math.min(9, Math.trunc(stableOffset)));
  return 1000 + Math.round(footY * 10) + offset;
}
