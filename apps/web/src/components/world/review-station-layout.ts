import { scaleHudSafeAreas } from "./world-hud";

export type ReviewStatus = "queued" | "ai_reviewed" | "teacher_decided";
export type ReviewDecision = "approve" | "adjust" | "reject";

export type ReviewVisualState = {
  tone: "pending" | "reviewed" | "decided" | "success" | "warning" | "danger";
  color: string;
  icon: "hourglass" | "scan" | "stamp" | "check" | "edit" | "cross";
  label: string;
};

export const REVIEW_STATUS_VISUALS: Record<ReviewStatus, ReviewVisualState> = {
  queued: { tone: "pending", color: "#f59e0b", icon: "hourglass", label: "排队中" },
  ai_reviewed: { tone: "reviewed", color: "#38bdf8", icon: "scan", label: "AI 已评审" },
  teacher_decided: { tone: "decided", color: "#22c55e", icon: "stamp", label: "老师已裁定" },
};

export const REVIEW_DECISION_VISUALS: Record<ReviewDecision, ReviewVisualState> = {
  approve: { tone: "success", color: "#22c55e", icon: "check", label: "通过" },
  adjust: { tone: "warning", color: "#f59e0b", icon: "edit", label: "调整" },
  reject: { tone: "danger", color: "#ef4444", icon: "cross", label: "退回" },
};

export const REVIEW_STATION_DEPTHS = {
  room: 0,
  floorMarks: 1,
  obstacles: 3,
  actors: 4,
  effects: 5,
  labels: 6,
  hud: 10,
} as const;

export type ReviewStationPoint = {
  x: number;
  y: number;
};

export type ReviewStationRect = ReviewStationPoint & {
  width: number;
  height: number;
};

export type ReviewStationObstacle = ReviewStationRect & {
  id: string;
};

export type ReviewStationWalkNode = ReviewStationPoint & {
  id: string;
};

export type ReviewStationWalkRoute = {
  id: string;
  nodeIds: string[];
};

export type ReviewStationWalkGraph = {
  nodes: ReviewStationWalkNode[];
  obstacles: ReviewStationObstacle[];
  routes: ReviewStationWalkRoute[];
};

export type ReviewStationLayout = {
  hudSafeAreas: { top: number; bottom: number };
  hudSafeArea: ReviewStationRect;
  statusScreen: ReviewStationPoint;
  decisionDesk: ReviewStationPoint;
  waitingAnchors: ReviewStationPoint[];
  qualityTerminal: ReviewStationPoint;
  presentationSpot: ReviewStationPoint;
  entrance: ReviewStationPoint;
  obstacles: ReviewStationObstacle[];
  walkRoute: ReviewStationWalkRoute;
};

function scalePoint(
  point: ReviewStationPoint,
  scaleX: number,
  scaleY: number,
): ReviewStationPoint {
  return {
    x: Math.round(point.x * scaleX),
    y: Math.round(point.y * scaleY),
  };
}

function scaleRect(
  rect: ReviewStationRect,
  scaleX: number,
  scaleY: number,
): ReviewStationRect {
  return {
    ...scalePoint(rect, scaleX, scaleY),
    width: Math.round(rect.width * scaleX),
    height: Math.round(rect.height * scaleY),
  };
}

const BASE_OBSTACLES: ReviewStationObstacle[] = [
  { id: "status-screen", x: 326, y: 64, width: 308, height: 104 },
  { id: "decision-desk", x: 344, y: 174, width: 272, height: 150 },
  { id: "waiting-left", x: 72, y: 178, width: 182, height: 212 },
  { id: "waiting-right", x: 706, y: 178, width: 182, height: 212 },
  { id: "quality-terminal", x: 692, y: 392, width: 192, height: 72 },
];

const REVIEWER_ROUTE: ReviewStationWalkRoute = {
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
};

export function buildReviewStationLayout(
  viewportWidth: number,
  viewportHeight: number,
): ReviewStationLayout {
  const scaleX = viewportWidth / 960;
  const scaleY = viewportHeight / 540;
  const point = (x: number, y: number) => scalePoint({ x, y }, scaleX, scaleY);

  return {
    hudSafeAreas: scaleHudSafeAreas(viewportHeight),
    hudSafeArea: scaleRect({ x: 24, y: 56, width: 912, height: 412 }, scaleX, scaleY),
    statusScreen: point(480, 116),
    decisionDesk: point(480, 260),
    waitingAnchors: [point(174, 220), point(174, 300), point(786, 220), point(786, 300)],
    qualityTerminal: point(788, 428),
    presentationSpot: point(480, 352),
    entrance: point(480, 452),
    obstacles: BASE_OBSTACLES.map(({ id, ...rect }) => ({
      id,
      ...scaleRect(rect, scaleX, scaleY),
    })),
    walkRoute: { ...REVIEWER_ROUTE, nodeIds: [...REVIEWER_ROUTE.nodeIds] },
  };
}

export function buildReviewStationWalkGraph(
  viewportWidth: number,
  viewportHeight: number,
): ReviewStationWalkGraph {
  const scaleX = viewportWidth / 960;
  const scaleY = viewportHeight / 540;
  const node = (id: string, x: number, y: number): ReviewStationWalkNode => ({
    id,
    ...scalePoint({ x, y }, scaleX, scaleY),
  });
  const layout = buildReviewStationLayout(viewportWidth, viewportHeight);

  return {
    nodes: [
      node("entrance", 480, 452),
      node("presentation-spot", 480, 352),
      node("decision-desk-front", 480, 330),
      node("quality-terminal-front", 676, 374),
    ],
    obstacles: layout.obstacles,
    routes: [{ ...layout.walkRoute, nodeIds: [...layout.walkRoute.nodeIds] }],
  };
}

export function buildReviewStationVisualConfig() {
  return { showRouteOverlay: false } as const;
}
