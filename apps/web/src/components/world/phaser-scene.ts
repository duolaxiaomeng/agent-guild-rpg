import { T, ZONE_DEFS, type ZoneDef, type AgentDef, type NpcDef, type ZoneId } from "./zone-config";
import { buildCharacterRenderSpec } from "./workstations-characters";
import {
  CHARACTER_WALK_FRAME_MS,
  nextCharacterWalkFrame,
  resolveCharacterWalkPose,
} from "./character-motion";
import {
  WORKSTATION_DEPTHS,
  buildWorkstationModelManifest,
  buildWorkstationPreloadEntries,
  resolveWorkstationPlacement,
  resolveWorkstationCharacterKey,
  resolveSeatedDeskScale,
  workstationRoleFromOutfit,
  type CharacterFacing,
  type DeskRole,
  type WorkstationModelSpec,
  type WorkstationRole,
} from "./workstation-visuals";
import {
  WorkstationMotionCoordinator,
  resolveWorkstationVisualState,
  type WorkstationVisualState,
} from "./workstation-motion";
import {
  OFFICE_ZONE_DEPTHS,
  drawDedicatedOfficeZone,
  officeFootDepth,
} from "./office-zone-visuals";
import type {
  AvatarMoveAck,
  AvatarMoveCommand,
  AvatarMovement,
} from "contracts";
import { WORKSTATION_HOME_BY_VISUAL_ROLE } from "contracts";
import {
  findWorkstationPath,
  fromCanonicalWorkstationPoint,
  toCanonicalWorkstationPoint,
} from "./workstation-pathfinding";

export const PIXEL_WORLD_MOUNT_ID = "pixel-world";

export const ZONE_SCENE_KEYS: Record<string, string> = Object.fromEntries(
  ZONE_DEFS.map((z) => [z.id, z.id]),
);

type PhaserModule = typeof import("phaser");

/** Avatar status type shared between API, Phaser and WebSocket. */
export type AvatarStatus =
  | "online"
  | "working"
  | "reviewing"
  | "idle"
  | "offline";

/** A single agent avatar state derived from the backend. */
export type AgentAvatarState = {
  studentId: string;
  displayName: string;
  status: AvatarStatus;
  currentZone: string;
  lastActiveAt: string | null;
  activitySummary: string;
  ownerRole?: "teacher" | "student";
  agentRole?: string | null;
  visualRole?: WorkstationRole | null;
  position?: {
    zone: "workstations";
    x: number;
    y: number;
    facing: CharacterFacing;
    revision: number;
    updatedAt: string;
  };
  movementLocked?: boolean;
  movementLockReason?: "task_running" | "reviewing" | null;
};

export type AvatarMoveRequestSender = (
  command: AvatarMoveCommand,
  onAck: (ack: AvatarMoveAck) => void,
) => void;

const AGENT_ROLE_LABELS: Record<string, string> = {
  ta: "助教",
  reviewer: "评审",
  mentor: "答疑",
  qa: "测试专家",
  "philosophy-design-mentor": "设计导师",
  "software-architect": "软件架构师",
  "deployment-release": "部署发布",
  "frontend-developer": "前端开发",
  "backend-developer": "后端开发",
  "operations-architect": "运维架构",
};

function formatAgentLabel(avatar: AgentAvatarState | undefined, fallback: string) {
  if (!avatar?.displayName) return fallback;
  if (avatar.ownerRole === "teacher") return `${avatar.displayName} · 老师 Agent`;
  const roleLabel = avatar.agentRole ? AGENT_ROLE_LABELS[avatar.agentRole] : undefined;
  return roleLabel ? `${avatar.displayName} · ${roleLabel}` : avatar.displayName;
}

export function shouldRenderOnlineAvatar(avatar: AgentAvatarState | undefined) {
  return Boolean(avatar && avatar.status !== "offline");
}

const CONNECTED_AGENT_FALLBACKS: Record<ZoneId, AgentDef> = {
  lobby: {
    id: "lobby-agent-slot",
    label: "Agent",
    badgeNum: 1,
    x: 370,
    y: 360,
    tooltip: "已进入工作室大厅",
    shirtColor: "#2563eb",
    hairColor: "#312e81",
    pose: "standing",
    facing: "down",
    archetype: "lead",
    outfit: "navy-lead",
  },
  workstations: {
    id: "workstation-agent-slot",
    label: "Agent",
    badgeNum: 1,
    x: 430,
    y: 260,
    tooltip: "已进入工位区",
    shirtColor: "#2563eb",
    hairColor: "#312e81",
    pose: "standing",
    facing: "down",
    archetype: "maker",
    outfit: "blue-shirt",
  },
  "collab-room": {
    id: "collab-agent-slot",
    label: "Agent",
    badgeNum: 1,
    x: 360,
    y: 360,
    tooltip: "已进入协作区",
    shirtColor: "#2563eb",
    hairColor: "#312e81",
    pose: "standing",
    facing: "right",
    archetype: "maker",
    outfit: "blue-shirt",
  },
  "review-station": {
    id: "review-agent-slot",
    label: "Agent",
    badgeNum: 1,
    x: 360,
    y: 360,
    tooltip: "已进入评审区",
    shirtColor: "#2563eb",
    hairColor: "#312e81",
    pose: "standing",
    facing: "right",
    archetype: "maker",
    outfit: "blue-shirt",
  },
};

const OUTFIT_BY_VISUAL_ROLE: Partial<Record<WorkstationRole, AgentDef["outfit"]>> = {
  browser: "blue-shirt",
  coder: "green-jacket",
  files: "purple-shirt",
  ops: "orange-jacket",
  lead: "navy-lead",
};

export function buildZoneAgentRoster(
  zone: ZoneDef,
  avatars: AgentAvatarState[] = [],
  controlledAgentId?: string,
): AgentDef[] {
  const visible = avatars
    .filter(
      (avatar) =>
        shouldRenderOnlineAvatar(avatar) && avatar.currentZone === zone.id,
    );
  const connected = (zone.id === "workstations"
    ? visible.filter(
        (avatar) =>
          avatar.studentId === controlledAgentId
          && Boolean(avatar.agentRole)
          && Boolean(avatar.visualRole)
          && Boolean(avatar.position),
      )
    : visible)
    .sort((left, right) =>
      Number(right.studentId === controlledAgentId) -
      Number(left.studentId === controlledAgentId),
    );
  if (connected.length === 0) return [];

  const templates = zone.agents.length > 0
    ? zone.agents
    : [CONNECTED_AGENT_FALLBACKS[zone.id]];

  return connected.map((avatar, index) => {
    const matchingOutfit = avatar.visualRole
      ? OUTFIT_BY_VISUAL_ROLE[avatar.visualRole]
      : undefined;
    const template = matchingOutfit
      ? templates.find((candidate) => candidate.outfit === matchingOutfit)
        ?? templates[index % templates.length]
      : templates[index % templates.length];
    const row = Math.floor(index / templates.length);
    const controlled = avatar.studentId === controlledAgentId;
    const persistedPosition = zone.id === "workstations"
      ? avatar.position
      : undefined;
    return {
      ...template,
      id: `connected-agent-${avatar.studentId}`,
      studentId: avatar.studentId,
      label: avatar.displayName,
      badgeNum: index + 1,
      x: persistedPosition?.x ?? template.x + row * 34,
      y: persistedPosition?.y ?? template.y + row * 28,
      tooltip: avatar.activitySummary || template.tooltip,
      outfit: avatar.visualRole
        ? OUTFIT_BY_VISUAL_ROLE[avatar.visualRole] ?? template.outfit
        : template.outfit,
      facing: persistedPosition?.facing ?? template.facing,
      ...(controlled
        ? {
            seated: false,
            pose: "standing" as const,
            routeId: undefined,
            homeNodeId: undefined,
            roleBehavior: undefined,
          }
        : {}),
    };
  });
}

export function resolveControlledDestination(
  x: number,
  y: number,
  width: number,
  height: number,
) {
  return {
    x: Math.min(Math.max(x, 36), Math.max(36, width - 36)),
    y: Math.min(Math.max(y, 88), Math.max(88, height - 48)),
  };
}

/** Status → aura colour (hex number for Phaser Graphics). */
const STATUS_AURA_COLOR: Record<AvatarStatus, number> = {
  online: 0x22c55e, // green
  working: 0x3b82f6, // blue
  reviewing: 0xfbbf24, // yellow
  idle: 0x9ca3af, // gray
  offline: 0x6b7280,
};

/** Status → activity bubble text (null = no bubble). */
const STATUS_BUBBLE_TEXT: Record<AvatarStatus, string | null> = {
  online: null,
  working: "编码中...",
  reviewing: "评审中...",
  idle: null,
  offline: null,
};

/** Status → bobbing tween duration in ms (smaller = faster). */
const STATUS_TWEEN_DURATION: Record<AvatarStatus, number> = {
  online: 1000,
  working: 500,
  reviewing: 1600,
  idle: 2200,
  offline: 3000,
};

export function resolveActorLayering(
  zoneId: string,
  footY: number,
  labelOffset: number,
) {
  const actorDepth = zoneId === "workstations"
    ? WORKSTATION_DEPTHS.actor + footY / 1000
    : officeFootDepth(footY);
  return {
    actorDepth,
    auraDepth: actorDepth - 1,
    bubbleDepth: zoneId === "workstations"
      ? WORKSTATION_DEPTHS.labels
      : OFFICE_ZONE_DEPTHS.labels,
    labelY: footY - labelOffset,
  };
}

export function shouldRebuildSceneForResize(
  previous: { width: number; height: number },
  next: { width: number; height: number },
): boolean {
  return previous.width !== next.width || previous.height !== next.height;
}

export function buildWorldPostBoot(initialSceneKey: string) {
  return (game: { scene: { start: (key: string) => unknown } }) => {
    game.scene.start(initialSceneKey);
  };
}

/** Stored visual references for a single agent avatar (enables incremental updates). */
type AgentRefRecord = {
  agentIndex: number;
  originX: number;
  originY: number;
  container: Phaser.GameObjects.Container;
  aura: Phaser.GameObjects.Graphics | null;
  label: Phaser.GameObjects.Text;
  bubble: { label: Phaser.GameObjects.Text; bg: Phaser.GameObjects.Graphics } | null;
  currentStatus: AvatarStatus;
  sprite?: Phaser.GameObjects.Image;
  role?: WorkstationRole;
  facing?: CharacterFacing;
  visualState?: WorkstationVisualState;
  walkFrame?: number;
  workstation?: WorkstationModelRef;
  lastRevision?: number;
};

type WorkstationOccupancy = "empty" | "occupied-idle" | "occupied-active";

type WorkstationModelRef = {
  rear: Phaser.GameObjects.Image;
  front: Phaser.GameObjects.Image;
  screenGlow: Phaser.GameObjects.Graphics;
  role: DeskRole;
  spec: WorkstationModelSpec;
  placement: ReturnType<typeof resolveWorkstationPlacement>;
  screenRects: Array<{ x: number; y: number; width: number; height: number }>;
  occupancy: WorkstationOccupancy;
};

type WorkstationModelMap = Record<string, WorkstationModelRef>;

/** Per-scene map of agent visual references keyed by agent ID. */
type AgentRefMap = Record<string, Record<string, AgentRefRecord>>;

export type ScenePlugin = {
  start: (key: string) => void;
  stop: (key: string) => void;
  isActive: (key: string) => boolean;
  getScene: (key: string) => Phaser.Scene;
};

export type DestroyableGame = {
  destroy: (removeCanvas: boolean, noReturn?: boolean) => void;
  scene: ScenePlugin;
  registry: {
    events: {
      on: (event: string, callback: (...args: any[]) => void) => void;
      off: (event: string, callback?: (...args: any[]) => void) => void;
      emit: (event: string, ...args: any[]) => void;
      removeAllListeners: (event?: string) => void;
    };
    set: (key: string, value: unknown) => void;
    get: (key: string) => unknown;
  };
};

/* ------------------------------------------------------------------ */
/*  Tileset constants                                                  */
/* ------------------------------------------------------------------ */

const TILE_SIZE = 16;
const TILESET_KEY = "roguelike-tiles";

/** Global character/NPC scale multiplier (1.5× original size). */
const CHAR_SCALE = 1.5;
const TILESET_URL =
  "/assets/kenney/roguelike-rpg-pack/Spritesheet/roguelikeSheet_transparent.png";

export type WorkstationsLayout = {
  roomRect: { x: number; y: number; width: number; height: number };
  wallBand: { x: number; y: number; width: number; height: number };
  topPanels: Array<{ id: string; label: string; x: number; y: number; width: number; height: number }>;
  doubleDeskAnchors: Array<{ x: number; y: number }>;
  multiScreenDesk: { x: number; y: number };
  focusDesk: { x: number; y: number };
  loungeRect: { x: number; y: number; width: number; height: number };
  corridorRect: { x: number; y: number; width: number; height: number };
  reviewRoom: { x: number; y: number; width: number; height: number };
  reviewDoor: { x: number; y: number };
  taskBoard: { x: number; y: number };
  routeLegend: { x: number; y: number; width: number; height: number };
  behaviorLegend: { x: number; y: number; width: number; height: number };
  walkerAnchors: Array<{ x: number; y: number }>;
  cameraZoom: number;
};

export type WorkstationsWalkNode = {
  id: string;
  x: number;
  y: number;
};

export type WorkstationsWalkRoute = {
  id: string;
  nodeIds: string[];
};

export type WorkstationsObstacle = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type WorkstationsWalkGraph = {
  nodes: WorkstationsWalkNode[];
  routes: WorkstationsWalkRoute[];
  obstacles: WorkstationsObstacle[];
};

export type WorkstationTextureManifest = {
  furniture: string[];
  characters: string[];
};

export function buildWorkstationTextureManifest(): WorkstationTextureManifest {
  return {
    furniture: [
      "desk-single",
      "desk-lead",
      "lounge-sofa",
      "coffee-counter",
      "water-cooler",
      "review-door",
    ],
    characters: [
      "agent-seated-blue-shirt",
      "agent-seated-green-jacket",
      "agent-seated-purple-shirt",
      "agent-seated-orange-jacket",
      "agent-seated-navy-lead",
      "npc-walking-teal-staff",
      "npc-walking-gray-visitor",
    ],
  };
}

export function buildWorkstationVisualConfig() {
  return {
    showRouteOverlay: false,
    showRouteLegends: false,
  } as const;
}

export function buildWorkstationsLayout(vw: number, _vh: number): WorkstationsLayout {
  return {
    roomRect: { x: 22, y: 28, width: 916, height: 486 },
    wallBand: { x: 88, y: 44, width: 704, height: 76 },
    topPanels: [
      { id: "agent-guild", label: "AGENT GUILD", x: 150, y: 64, width: 86, height: 52 },
      { id: "task-board", label: "TASK BOARD", x: 340, y: 72, width: 132, height: 58 },
      { id: "status", label: "STATUS", x: 536, y: 72, width: 118, height: 58 },
      { id: "announcement", label: "ANNOUNCEMENT", x: 706, y: 72, width: 134, height: 58 },
    ],
    doubleDeskAnchors: [
      { x: 122, y: 214 },
      { x: 316, y: 214 },
      { x: 122, y: 348 },
      { x: 316, y: 348 },
    ],
    multiScreenDesk: { x: 482, y: 454 },
    focusDesk: { x: 482, y: 454 },
    loungeRect: { x: 568, y: 120, width: 334, height: 300 },
    corridorRect: { x: 406, y: 122, width: 140, height: 348 },
    reviewRoom: { x: 748, y: 382, width: 142, height: 112 },
    reviewDoor: { x: 820, y: 438 },
    taskBoard: { x: 340, y: 72 },
    routeLegend: { x: 804, y: 142, width: 122, height: 100 },
    behaviorLegend: { x: 42, y: 406, width: 156, height: 92 },
    walkerAnchors: [
      { x: 468, y: 142 },
      { x: 590, y: 248 },
    ],
    cameraZoom: 1.08,
  };
}

export function buildWorkstationsWalkGraph(vw: number, vh: number): WorkstationsWalkGraph {
  const sx = vw / 960;
  const sy = vh / 540;
  const node = (id: string, x: number, y: number): WorkstationsWalkNode => ({
    id,
    x: Math.round(x * sx),
    y: Math.round(y * sy),
  });
  const rect = (
    id: string,
    x: number,
    y: number,
    width: number,
    height: number,
  ): WorkstationsObstacle => ({
    id,
    x: Math.round(x * sx),
    y: Math.round(y * sy),
    width: Math.round(width * sx),
    height: Math.round(height * sy),
  });

  return {
    nodes: [
      node("browser-desk", 122, 214),
      node("coder-desk", 316, 214),
      node("files-desk", 122, 348),
      node("ops-desk", 316, 348),
      node("browser-aisle", 122, 282),
      node("coder-aisle", 316, 282),
      node("workstation-aisle-east", 392, 282),
      node("lead-station", 482, 454),
      node("task-board", 340, 132),
      node("main-corridor-north", 468, 142),
      node("main-corridor-mid", 468, 282),
      node("main-corridor-south", 468, 414),
      node("lounge-entry", 590, 248),
      node("coffee-counter", 744, 356),
      node("review-door", 820, 438),
      node("display-wall", 498, 92),
      node("guild-sign", 186, 72),
      node("announcement-panel", 706, 72),
    ],
    obstacles: [
      rect("desk-cluster-a", 76, 164, 296, 254),
      rect("lead-desk", 396, 420, 168, 76),
      rect("lounge-block", 568, 120, 334, 300),
      rect("review-room", 748, 382, 142, 112),
    ],
    routes: [
      {
        id: "browser-board-loop",
        nodeIds: ["browser-desk", "browser-aisle", "workstation-aisle-east", "main-corridor-mid", "main-corridor-north", "display-wall", "task-board", "main-corridor-north", "main-corridor-mid", "workstation-aisle-east", "browser-aisle", "browser-desk"],
      },
      {
        id: "coder-board-loop",
        nodeIds: ["coder-desk", "coder-aisle", "workstation-aisle-east", "main-corridor-mid", "main-corridor-north", "task-board", "main-corridor-north", "main-corridor-mid", "workstation-aisle-east", "coder-aisle", "coder-desk"],
      },
      {
        id: "files-lounge-loop",
        nodeIds: ["files-desk", "browser-aisle", "workstation-aisle-east", "main-corridor-mid", "lounge-entry", "coffee-counter", "lounge-entry", "main-corridor-mid", "workstation-aisle-east", "browser-aisle", "files-desk"],
      },
      {
        id: "ops-review-loop",
        nodeIds: ["ops-desk", "coder-aisle", "workstation-aisle-east", "main-corridor-mid", "main-corridor-south", "review-door", "main-corridor-south", "main-corridor-mid", "workstation-aisle-east", "coder-aisle", "ops-desk"],
      },
      {
        id: "lead-review-loop",
        nodeIds: ["lead-station", "review-door", "main-corridor-south", "lead-station"],
      },
      {
        id: "staff-patrol-loop",
        nodeIds: ["main-corridor-north", "main-corridor-mid", "main-corridor-south", "review-door", "main-corridor-south", "main-corridor-mid", "main-corridor-north"],
      },
      {
        id: "visitor-lounge-loop",
        nodeIds: ["lounge-entry", "coffee-counter", "main-corridor-mid", "lounge-entry"],
      },
    ],
  };
}

/* ------------------------------------------------------------------ */
/*  Tile data generation                                               */
/* ------------------------------------------------------------------ */

/** Convert sprite frame index to tilemap data value (1-based; 0 = empty). */
function tileVal(frameIndex: number): number {
  return frameIndex + 1;
}

/** Deterministic hash for reproducible scatter. */
function hash(x: number, y: number, seed: number): number {
  return ((x * 137 + y * 211 + seed * 31) % 97) / 97;
}

/**
 * Generate a 2-D tile data grid for office floors.
 * Gray tile = work area, Wood = break/corridor area.
 */
function generateOfficeTiles(
  cols: number,
  rows: number,
  base: number,
  variation: number,
  path: number,
  zone: ZoneDef,
  vw: number,
  vh: number,
): number[][] {
  const data: number[][] = [];

  for (let y = 0; y < rows; y++) {
    const row: number[] = [];
    for (let x = 0; x < cols; x++) {
      const h = hash(x, y, 42);
      row.push(h < 0.18 ? tileVal(variation) : tileVal(base));
    }
    data.push(row);
  }

  // Path corridors connecting landmarks
  const pathRows = [Math.floor(rows * 0.45), Math.floor(rows * 0.55)];
  for (const pr of pathRows) {
    for (let x = 0; x < cols; x++) {
      if (pr >= 0 && pr < rows) data[pr][x] = tileVal(path);
    }
  }

  // Vertical connectors between landmarks
  if (zone.landmarks.length >= 2) {
    for (let i = 0; i < zone.landmarks.length - 1; i++) {
      const ax = Math.floor((zone.landmarks[i].x / vw) * cols);
      const bx = Math.floor((zone.landmarks[i + 1].x / vw) * cols);
      const ay = Math.floor((zone.landmarks[i].y / vh) * rows);
      const by = Math.floor((zone.landmarks[i + 1].y / vh) * rows);
      const minX = Math.max(0, Math.min(ax, bx) - 1);
      const maxX = Math.min(cols - 1, Math.max(ax, bx) + 1);
      const minY = Math.max(0, Math.min(ay, by));
      const maxY = Math.min(rows - 1, Math.max(ay, by));
      for (let ty = minY; ty <= maxY; ty++) {
        for (let tx = minX; tx <= maxX; tx++) {
          data[ty][tx] = tileVal(path);
        }
      }
    }
  }

  // Circular area around first landmark
  if (zone.landmarks.length > 0) {
    const cx = Math.floor((zone.landmarks[0].x / vw) * cols);
    const cy = Math.floor((zone.landmarks[0].y / vh) * rows);
    const r = 4;
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dy * dy <= r * r) {
          const ty = cy + dy;
          const tx = cx + dx;
          if (ty >= 0 && ty < rows && tx >= 0 && tx < cols) {
            data[ty][tx] = tileVal(path);
          }
        }
      }
    }
  }

  return data;
}

export function buildOfficeTilesForZone(
  cols: number,
  rows: number,
  zone: ZoneDef,
  vw: number,
  vh: number,
): number[][] {
  if (zone.id === "lobby") {
    return Array.from({ length: rows }, (_, y) =>
      Array.from({ length: cols }, (_, x) => {
        if (y < 5) return tileVal(T.FLOOR);
        if (x >= 3 && x <= 13 && y >= 8 && y <= 20) return tileVal(T.WOOD);
        if (x >= 33 && x <= 44 && y >= 8 && y <= 20) return tileVal(T.FLOOR);
        return tileVal(x % 5 === 0 ? T.STONE_ALT : T.STONE);
      }),
    );
  }

  if (zone.id === "collab-room") {
    return Array.from({ length: rows }, (_, y) =>
      Array.from({ length: cols }, (_, x) => {
        if (x >= 14 && x <= 30 && y >= 12 && y <= 21) return tileVal(T.FLOOR);
        return tileVal((x + y) % 2 === 0 ? T.WOOD : T.WOOD_ALT);
      }),
    );
  }

  if (zone.id === "review-station") {
    return Array.from({ length: rows }, (_, y) =>
      Array.from({ length: cols }, (_, x) => {
        if (x >= 22 && x <= 25 && y >= 18) return tileVal(T.ROAD_ALT);
        if (x >= 4 && x <= 15 && y >= 10 && y <= 24) return tileVal(T.STONE_ALT);
        return tileVal(T.STONE);
      }),
    );
  }

  if (zone.id !== "workstations") {
    return generateOfficeTiles(cols, rows, zone.baseTile, zone.varTile, zone.pathTile, zone, vw, vh);
  }

  const data = Array.from({ length: rows }, () =>
    Array.from({ length: cols }, (_, x) => tileVal(x % 5 === 0 ? T.FLOOR : T.STONE)),
  );

  for (let y = 0; y < 5; y++) {
    for (let x = 4; x < cols - 4; x++) {
      data[y][x] = tileVal(T.FLOOR);
    }
  }

  for (let y = 16; y < rows - 2; y++) {
    for (let x = 31; x < cols - 2; x++) {
      data[y][x] = tileVal(x % 12 < 6 ? T.WOOD : T.WOOD_ALT);
    }
  }

  return data;
}

/* ------------------------------------------------------------------ */
/*  UI helpers                                                         */
/* ------------------------------------------------------------------ */

function hex(c: string): number {
  return parseInt(c.slice(1), 16);
}

function strokeText(
  scene: Phaser.Scene,
  x: number,
  y: number,
  text: string,
  fontSize = "14px",
  originX = 0,
  originY = 0,
) {
  const t = scene.add.text(x, y, text, {
    color: "#fff",
    fontSize,
    fontFamily: 'monospace',
    stroke: "#000",
    strokeThickness: 3,
  });
  t.setOrigin(originX, originY);
  return t;
}

function tooltipBox(
  scene: Phaser.Scene,
  x: number,
  y: number,
  text: string,
) {
  const pad = 6;
  const bg = scene.add.graphics();
  bg.fillStyle(0x000000, 0.65);

  const t = scene.add.text(x + pad, y + pad, text, {
    color: "#fff",
    fontSize: "12px",
    fontFamily: 'monospace',
  });
  bg.fillRoundedRect(x, y, t.width + pad * 2, t.height + pad * 2, 4);
}

/* ------------------------------------------------------------------ */
/*  Particle effects (office theme)                                    */
/* ------------------------------------------------------------------ */

function createParticles(scene: Phaser.Scene, zone: ZoneDef, vw: number) {
  function makeParticleTex(key: string, color: string) {
    if (scene.textures.exists(key)) return;
    const g = scene.add.graphics();
    g.fillStyle(parseInt(color.slice(1), 16), 1);
    g.fillRect(0, 0, 2, 2);
    g.generateTexture(key, 2, 2);
    g.destroy();
  }

  makeParticleTex("p-blue", "#60a5fa");
  makeParticleTex("p-spark", "#fbbf24");

  // Ambient floating particles (office dust/light)
  scene.add.particles(0, 0, "p-blue", {
    x: { min: 0, max: vw },
    y: -10,
    speed: { min: 4, max: 10 },
    angle: { min: 85, max: 95 },
    lifespan: 8000,
    frequency: 800,
    scale: { start: 0.8, end: 0 },
    alpha: { start: 0.3, end: 0 },
  });

}

/* ------------------------------------------------------------------ */
/*  Generated workstation textures                                     */
/* ------------------------------------------------------------------ */

function makeTexture(scene: Phaser.Scene, key: string, width: number, height: number, draw: (g: Phaser.GameObjects.Graphics) => void) {
  if (scene.textures.exists(key)) return;
  const g = scene.add.graphics();
  draw(g);
  g.generateTexture(key, width, height);
  g.destroy();
}

function drawGeneratedDeskTexture(
  g: Phaser.GameObjects.Graphics,
  width: number,
  height: number,
  lead = false,
) {
  const deskX = 8;
  const deskY = lead ? 28 : 26;
  g.fillStyle(0x5b3417, 1);
  g.fillRect(deskX, deskY + 34, width - 16, 10);
  g.fillStyle(0x78350f, 1);
  g.fillRect(deskX + 6, deskY + 44, 8, height - deskY - 46);
  g.fillRect(width - 22, deskY + 44, 8, height - deskY - 46);
  g.fillStyle(0x8b4a20, 1);
  g.fillRect(deskX, deskY, width - 16, 38);
  g.fillStyle(0xb45309, 1);
  g.fillRect(deskX, deskY, width - 16, 7);
  const monitorXs = lead ? [22, width - 50] : [16];
  monitorXs.forEach((mx) => {
    g.fillStyle(0x111827, 1);
    g.fillRect(mx, 4, 34, 26);
    g.fillStyle(0x1d4ed8, 1);
    g.fillRect(mx + 4, 8, 26, 18);
    g.fillStyle(0x60a5fa, 0.85);
    g.fillRect(mx + 7, 12, 18, 2);
    g.fillRect(mx + 7, 17, 14, 2);
    g.fillStyle(0x1f2937, 1);
    g.fillRect(mx + 14, 30, 6, 8);
  });
  g.fillStyle(0xf8fafc, 1);
  g.fillRect(width - 34, deskY + 12, 18, 12);
  g.fillStyle(0x94a3b8, 0.8);
  g.fillRect(width - 30, deskY + 16, 10, 1);
  g.fillRect(width - 30, deskY + 20, 8, 1);
  g.fillStyle(0xe5e7eb, 1);
  g.fillRect(18, deskY + 13, 7, 9);
}

function drawWorkstationRearLayer(
  g: Phaser.GameObjects.Graphics,
  role: DeskRole,
  width: number,
  height: number,
) {
  const deskTop = Math.round(height * 0.56);
  const chairX = Math.round(width * 0.67);
  const chairY = Math.round(height * 0.38);
  const accents: Record<DeskRole, number> = {
    browser: 0x38bdf8,
    coder: 0x22c55e,
    files: 0xa855f7,
    ops: 0xf97316,
    lead: 0x2563eb,
  };
  const monitorXs = role === "lead" ? [Math.round(width * 0.12), Math.round(width * 0.57)] : [Math.round(width * 0.12)];

  g.fillStyle(0x1f2937, 1);
  g.fillRoundedRect(chairX, chairY, Math.round(width * 0.22), Math.round(height * 0.4), 7);
  g.fillStyle(0x475569, 1);
  g.fillRoundedRect(chairX + 5, chairY + 7, Math.round(width * 0.15), Math.round(height * 0.24), 5);
  g.fillStyle(0x111827, 1);
  g.fillRect(chairX + 12, chairY + Math.round(height * 0.36), 4, 12);

  g.fillStyle(0x8b4a20, 1);
  g.fillRect(8, deskTop, width - 16, 13);
  g.fillStyle(0xd08a3e, 0.9);
  g.fillRect(10, deskTop + 2, width - 20, 3);

  monitorXs.forEach((monitorX) => {
    g.fillStyle(0x0f172a, 1);
    g.fillRect(monitorX, 8, Math.round(width * 0.27), Math.round(height * 0.27));
    g.fillStyle(accents[role], 0.9);
    g.fillRect(monitorX + 4, 12, Math.round(width * 0.21), Math.round(height * 0.19));
    g.fillStyle(0xe0f2fe, 0.72);
    g.fillRect(monitorX + 7, 16, Math.round(width * 0.13), 2);
    g.fillRect(monitorX + 7, 21, Math.round(width * 0.1), 2);
    g.fillStyle(0x1f2937, 1);
    g.fillRect(monitorX + Math.round(width * 0.12), Math.round(height * 0.27), 5, 10);
  });

  g.fillStyle(0x111827, 1);
  g.fillRoundedRect(Math.round(width * 0.3), deskTop + 2, Math.round(width * 0.24), 6, 2);
  if (role === "browser") {
    g.fillStyle(0x60a5fa, 1);
    g.fillRect(width - 26, deskTop + 3, 8, 9);
  } else if (role === "files") {
    g.fillStyle(0xfef3c7, 1);
    g.fillRect(width - 29, deskTop + 2, 16, 10);
  } else if (role === "ops") {
    g.fillStyle(0xef4444, 1);
    g.fillCircle(width - 22, deskTop + 7, 4);
  }
}

function drawWorkstationFrontLayer(
  g: Phaser.GameObjects.Graphics,
  role: DeskRole,
  width: number,
  height: number,
) {
  const frontTop = Math.round(height * 0.64);
  g.fillStyle(0x5b3417, 1);
  g.fillRect(6, frontTop, width - 12, 10);
  g.fillStyle(0x78350f, 1);
  g.fillRect(10, frontTop + 10, width - 20, Math.round(height * 0.19));
  g.fillStyle(0xb45309, 1);
  g.fillRect(8, frontTop, width - 16, 3);
  g.fillStyle(0x3f2413, 1);
  g.fillRect(14, frontTop + 10, 6, height - frontTop - 10);
  g.fillRect(width - 20, frontTop + 10, 6, height - frontTop - 10);
  if (role === "lead") {
    g.fillStyle(0x1e293b, 1);
    g.fillRect(Math.round(width / 2) - 12, frontTop + 13, 24, 8);
    g.fillStyle(0xfbbf24, 1);
    g.fillRect(Math.round(width / 2) - 8, frontTop + 16, 16, 2);
  } else {
    g.fillStyle(0x4a2c15, 1);
    g.fillRect(width - 34, frontTop + 14, 13, 12);
    g.fillStyle(0xc08457, 0.8);
    g.fillRect(width - 31, frontTop + 17, 7, 1);
  }
}

function drawGeneratedAgentTexture(
  g: Phaser.GameObjects.Graphics,
  shirt: number,
  hair: number,
  lead = false,
  variant: "browser" | "coder" | "files" | "ops" | "lead" = "coder",
) {
  g.fillStyle(0x000000, 0.22);
  g.fillEllipse(36, 66, 32, 8);
  g.fillStyle(0x111827, 1);
  g.fillRect(18, 44, 30, 22);
  g.fillStyle(0x374151, 1);
  g.fillRect(21, 40, 24, 24);
  g.fillRect(44, 46, 8, 18);
  g.fillStyle(shirt, 1);
  g.fillRect(29, 30, 23, 26);
  g.fillStyle(0xffffff, 0.18);
  g.fillRect(33, 34, 5, 18);
  g.fillStyle(0xf7d7a8, 1);
  g.fillRect(42, 28, 7, 5);
  g.fillStyle(0xf7d7a8, 1);
  g.fillCircle(37, 22, lead ? 8 : 7);
  g.fillRect(46, 38, 6, 13);
  g.fillStyle(hair, 1);
  g.fillCircle(34, 17, lead ? 8 : 7);
  g.fillRect(27, 18, 16, 5);
  if (variant === "files") {
    g.fillRect(27, 22, 5, 12);
    g.fillRect(31, 28, 4, 8);
  } else if (variant === "coder") {
    g.fillRect(28, 14, 4, 5);
    g.fillRect(39, 15, 5, 4);
  } else if (variant === "lead") {
    g.fillRect(27, 14, 17, 4);
    g.fillRect(31, 11, 9, 4);
  }
  g.fillStyle(0x111827, 1);
  g.fillCircle(42, 22, 1.4);
  if (variant === "coder" || lead) {
    g.lineStyle(1, 0x0f172a, 1);
    g.strokeRect(39, 20, 6, 4);
    g.lineBetween(45, 22, 48, 22);
  }
  if (variant === "browser") {
    g.fillStyle(0x111827, 1);
    g.fillRect(26, 21, 3, 7);
    g.fillRect(45, 22, 5, 2);
    g.fillStyle(0x38bdf8, 1);
    g.fillRect(48, 24, 4, 2);
  }
  if (variant === "ops") {
    g.fillStyle(0xfed7aa, 1);
    g.fillRect(29, 31, 5, 3);
    g.fillStyle(0xfbbf24, 1);
    g.fillRect(48, 39, 4, 4);
  }
  if (variant === "files") {
    g.fillStyle(0xfef3c7, 1);
    g.fillRect(51, 43, 7, 9);
    g.fillStyle(0x7c3aed, 1);
    g.fillRect(53, 45, 4, 1);
  }
  if (lead) {
    g.fillStyle(0xfbbf24, 1);
    g.fillCircle(49, 39, 3);
    g.fillStyle(0x78350f, 1);
    g.fillRect(48, 38, 2, 2);
  }
}

function drawGeneratedNpcTexture(g: Phaser.GameObjects.Graphics, shirt: number, hair: number) {
  g.fillStyle(0x000000, 0.22);
  g.fillEllipse(24, 58, 26, 7);
  g.fillStyle(0x1f2937, 1);
  g.fillRect(16, 38, 6, 18);
  g.fillRect(27, 40, 6, 16);
  g.fillStyle(shirt, 1);
  g.fillRect(15, 24, 18, 22);
  g.fillStyle(0xf7d7a8, 1);
  g.fillCircle(24, 16, 7);
  g.fillRect(11, 28, 5, 14);
  g.fillRect(33, 30, 5, 12);
  g.fillStyle(hair, 1);
  g.fillCircle(23, 11, 7);
  g.fillRect(17, 13, 14, 4);
  g.fillStyle(0x111827, 1);
  g.fillCircle(27, 17, 1.2);
}

function ensureWorkstationTextures(scene: Phaser.Scene) {
  for (const [role, model] of Object.entries(buildWorkstationModelManifest()) as Array<[DeskRole, WorkstationModelSpec]>) {
    makeTexture(scene, model.rearKey, model.width, model.height, (g) => {
      drawWorkstationRearLayer(g, role, model.width, model.height);
    });
    makeTexture(scene, model.frontKey, model.width, model.height, (g) => {
      drawWorkstationFrontLayer(g, role, model.width, model.height);
    });
  }
  makeTexture(scene, "desk-single", 104, 84, (g) => drawGeneratedDeskTexture(g, 104, 84));
  makeTexture(scene, "desk-lead", 142, 88, (g) => drawGeneratedDeskTexture(g, 142, 88, true));
  makeTexture(scene, "lounge-sofa", 104, 52, (g) => {
    g.fillStyle(0x6b4f3f, 1);
    g.fillRoundedRect(6, 12, 92, 26, 5);
    g.fillStyle(0xc7aa86, 1);
    g.fillRoundedRect(10, 6, 84, 28, 5);
    g.fillStyle(0x9f7a56, 1);
    g.fillRect(14, 30, 76, 10);
    g.fillStyle(0xef4444, 1);
    g.fillRect(74, 18, 12, 10);
  });
  makeTexture(scene, "coffee-counter", 138, 58, (g) => {
    g.fillStyle(0x5b3417, 1);
    g.fillRect(4, 24, 130, 28);
    g.fillStyle(0x8b4a20, 1);
    g.fillRect(4, 18, 130, 12);
    g.fillStyle(0xf8fafc, 1);
    g.fillRect(72, 8, 8, 10);
    g.fillRect(86, 9, 8, 9);
    g.fillStyle(0x111827, 1);
    g.fillRect(24, 4, 26, 22);
    g.fillStyle(0xd1d5db, 1);
    g.fillRect(54, 10, 16, 16);
  });
  makeTexture(scene, "water-cooler", 42, 74, (g) => {
    g.fillStyle(0x1f2937, 1);
    g.fillRect(10, 28, 22, 38);
    g.fillStyle(0x60a5fa, 0.9);
    g.fillCircle(21, 18, 14);
    g.fillStyle(0xe0f2fe, 0.5);
    g.fillCircle(17, 14, 5);
  });
  makeTexture(scene, "review-door", 86, 104, (g) => {
    g.fillStyle(0x111827, 1);
    g.fillRect(8, 12, 70, 84);
    g.fillStyle(0x334155, 1);
    g.fillRect(14, 6, 58, 14);
    g.fillStyle(0x581c87, 1);
    g.fillRect(18, 26, 50, 64);
    g.fillStyle(0x8b5cf6, 0.9);
    g.fillRect(23, 30, 40, 54);
  });
  makeTexture(scene, "agent-seated-blue-shirt", 72, 76, (g) => drawGeneratedAgentTexture(g, 0x2563eb, 0x4a2c15, false, "browser"));
  makeTexture(scene, "agent-seated-green-jacket", 72, 76, (g) => drawGeneratedAgentTexture(g, 0x22c55e, 0x111827, false, "coder"));
  makeTexture(scene, "agent-seated-purple-shirt", 72, 76, (g) => drawGeneratedAgentTexture(g, 0x7c3aed, 0x3b2415, false, "files"));
  makeTexture(scene, "agent-seated-orange-jacket", 72, 76, (g) => drawGeneratedAgentTexture(g, 0xf97316, 0x4a2c15, false, "ops"));
  makeTexture(scene, "agent-seated-navy-lead", 72, 76, (g) => drawGeneratedAgentTexture(g, 0x1d4ed8, 0x111827, true, "lead"));
  makeTexture(scene, "npc-walking-teal-staff", 48, 66, (g) => drawGeneratedNpcTexture(g, 0x0f766e, 0x78350f));
  makeTexture(scene, "npc-walking-gray-visitor", 48, 66, (g) => drawGeneratedNpcTexture(g, 0x334155, 0x78350f));
}

function applyWorkstationSpriteState(
  scene: Phaser.Scene,
  sprite: Phaser.GameObjects.Image,
  role: WorkstationRole,
  state: WorkstationVisualState,
  walkFrame = 0,
  seatedPlacement?: Pick<ReturnType<typeof resolveWorkstationPlacement>, "characterHeight" | "seatedSpriteX" | "seatedSpriteY">,
  facing: CharacterFacing = "left",
) {
  const walkPose = resolveCharacterWalkPose(walkFrame);
  const key = resolveWorkstationCharacterKey(
    role,
    state,
    state === "walking" ? walkFrame : 0,
    facing,
  );
  if (scene.textures.exists(key)) sprite.setTexture(key);

  scene.tweens.killTweensOf(sprite);
  sprite.setAlpha(1).setOrigin(0.5, 0.92);
  const seated = state === "seated-idle" || state === "seated-active";
  const targetHeight = seated ? seatedPlacement?.characterHeight ?? 72 : 74;
  const sourceRatio = sprite.width / sprite.height;
  sprite.setDisplaySize(targetHeight * sourceRatio, targetHeight);
  const baseX = seated ? seatedPlacement?.seatedSpriteX ?? 0 : 0;
  const baseY = seated ? seatedPlacement?.seatedSpriteY ?? 22 : 18;

  if (state === "walking") {
    // Keep the route container upright and ease the small body shift instead
    // of snapping between walk poses every 160ms.  The two supplied pixel
    // textures are reused, while the y/angle interpolation creates a softer
    // four-phase stride without making the character wobble excessively.
    const targetAngle = walkPose.angle * 0.42;
    sprite.setX(baseX);
    scene.tweens.add({
      targets: sprite,
      y: baseY + walkPose.yOffset,
      angle: targetAngle,
      duration: Math.round(CHARACTER_WALK_FRAME_MS * 0.85),
      ease: "Sine.easeInOut",
    });
    return;
  }

  sprite.setPosition(baseX, baseY).setAngle(0);

  if (state === "seated-idle") {
    scene.tweens.add({
      targets: sprite,
      y: baseY - 1,
      angle: 0.18,
      duration: 1700,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });
    return;
  }
  if (state === "standing") {
    scene.tweens.add({
      targets: sprite,
      y: baseY - 1,
      angle: -0.16,
      duration: 1900,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });
    return;
  }
  if (state !== "seated-active") return;

  const motion = {
    browser: { angle: -1, duration: 850 },
    coder: { y: 20, duration: 180 },
    files: { angle: 1, duration: 720 },
    ops: { x: 1, duration: 420 },
    lead: { angle: -1, duration: 960 },
    staff: { y: 21, duration: 900 },
    visitor: { y: 21, duration: 1000 },
  }[role];
  scene.tweens.add({
    targets: sprite,
    ...motion,
    yoyo: true,
    repeat: -1,
    ease: "Sine.easeInOut",
  });
}

function addCharacterGroundShadow(
  scene: Phaser.Scene,
  container: Phaser.GameObjects.Container,
  width = 34,
  y = 21,
) {
  const shadow = scene.add.ellipse(0, y, width, 8, 0x020617, 0.2);
  container.add(shadow);
  scene.tweens.add({
    targets: shadow,
    scaleX: 0.9,
    alpha: 0.14,
    duration: 900,
    yoyo: true,
    repeat: -1,
    ease: "Sine.easeInOut",
  });
  return shadow;
}

/* ------------------------------------------------------------------ */
/*  Workstation route animation                                        */
/* ------------------------------------------------------------------ */

type RoutedActor = Pick<AgentDef | NpcDef, "id" | "routeId" | "walkSpeed" | "homeNodeId">;

function getWalkNodeMap(graph: WorkstationsWalkGraph): Map<string, WorkstationsWalkNode> {
  return new Map(graph.nodes.map((node) => [node.id, node]));
}

function resolveRouteNodes(
  graph: WorkstationsWalkGraph,
  actor: RoutedActor,
): WorkstationsWalkNode[] {
  if (!actor.routeId) return [];
  const route = graph.routes.find((item) => item.id === actor.routeId);
  if (!route) return [];

  const nodeMap = getWalkNodeMap(graph);
  const nodes = route.nodeIds
    .map((nodeId) => nodeMap.get(nodeId))
    .filter((node): node is WorkstationsWalkNode => Boolean(node));

  if (!actor.homeNodeId || nodes[0]?.id === actor.homeNodeId) {
    return nodes;
  }

  const homeIndex = nodes.findIndex((node) => node.id === actor.homeNodeId);
  if (homeIndex < 0) return nodes;
  return [...nodes.slice(homeIndex), ...nodes.slice(0, homeIndex + 1)];
}

function getFacingBetween(from: WorkstationsWalkNode, to: WorkstationsWalkNode) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx < 0 ? "left" : "right";
  }
  return dy < 0 ? "up" : "down";
}

function applyRouteFacing(
  container: Phaser.GameObjects.Container,
  from: WorkstationsWalkNode,
  to: WorkstationsWalkNode,
  onFacing?: (facing: "left" | "right" | "up" | "down") => void,
) {
  const facing = getFacingBetween(from, to);
  const scaleX = Math.max(Math.abs(container.scaleX), 0.01);
  const scaleY = Math.max(Math.abs(container.scaleY), 0.01);
  // The sprite itself handles horizontal facing via flipX.  Rotating the
  // whole container made the characters lean dramatically while walking and
  // looked like they were sliding around corners.
  container.setAngle(0);
  if (onFacing) {
    container.setScale(scaleX, scaleY);
    onFacing(facing);
    return;
  }
  container.setScale(facing === "left" ? -scaleX : scaleX, scaleY);
}

function startRouteLoop(
  scene: Phaser.Scene,
  container: Phaser.GameObjects.Container,
  actor: RoutedActor,
  graph?: WorkstationsWalkGraph,
  onWalkFrame?: (frame: number) => void,
  onMove?: () => void,
  onFacing?: (facing: "left" | "right" | "up" | "down") => void,
) {
  if (!graph || !actor.routeId) return false;

  const nodes = resolveRouteNodes(graph, actor);
  if (nodes.length < 2) return false;

  let segmentIndex = 0;
  let moving = false;
  let walkFrame = 0;
  container.setPosition(nodes[0].x, nodes[0].y);
  scene.time.addEvent({
    delay: CHARACTER_WALK_FRAME_MS,
    loop: true,
    callback: () => {
      if (!moving) return;
      walkFrame = nextCharacterWalkFrame(walkFrame);
      onWalkFrame?.(walkFrame);
    },
  });

  const playNextSegment = () => {
    if (!scene.scene.isActive()) return;
    const from = nodes[segmentIndex];
    const to = nodes[(segmentIndex + 1) % nodes.length];
    const distance = Math.hypot(to.x - from.x, to.y - from.y);
    const speed = actor.walkSpeed ?? 42;
    const duration = Math.max(520, (distance / speed) * 1000);

    applyRouteFacing(container, from, to, onFacing);
    moving = true;
    onWalkFrame?.(walkFrame);
    scene.tweens.add({
      targets: container,
      x: to.x,
      y: to.y,
      duration,
      ease: "Linear",
      onUpdate: onMove,
      onComplete: () => {
        moving = false;
        segmentIndex = (segmentIndex + 1) % nodes.length;
        playNextSegment();
      },
    });
  };

  // Let the scene finish its first layout pass, then start the patrol quickly
  // so the alternating forward/back foot poses are visible instead of leaving
  // the NPC frozen in the standing frame for several seconds.
  scene.time.delayedCall(900, playNextSegment);
  return true;
}

type AgentRouteHooks = {
  getStatus: () => AvatarStatus;
  onState: (state: WorkstationVisualState, walkFrame?: number) => void;
  onHome: (status: AvatarStatus) => void;
  onMove: () => void;
  onFacing?: (facing: "left" | "right" | "up" | "down") => void;
};

function startAgentRouteCycle(
  scene: Phaser.Scene,
  container: Phaser.GameObjects.Container,
  actor: RoutedActor,
  graph: WorkstationsWalkGraph | undefined,
  coordinator: WorkstationMotionCoordinator,
  hooks: AgentRouteHooks,
) {
  if (!graph || !actor.routeId) return false;
  const nodes = resolveRouteNodes(graph, actor);
  if (nodes.length < 2) return false;

  let cycle = 0;
  let walkFrame = 0;
  let moving = false;
  container.setPosition(nodes[0].x, nodes[0].y);
  scene.time.addEvent({
    delay: CHARACTER_WALK_FRAME_MS,
    loop: true,
    callback: () => {
      if (!moving) return;
      walkFrame = nextCharacterWalkFrame(walkFrame);
      hooks.onState("walking", walkFrame);
    },
  });

  const scheduleNext = () => {
    const delay = coordinator.getDelayMs(actor.id, cycle);
    cycle += 1;
    scene.time.delayedCall(delay, tryBegin);
  };

  const tryBegin = () => {
    if (!scene.scene.isActive()) return;
    const status = hooks.getStatus();
    const allowed = coordinator.tryBegin(actor.id, status);
    if (!allowed) {
      scene.time.delayedCall(2000, tryBegin);
      return;
    }
    hooks.onState("standing");
    scene.time.delayedCall(240, () => moveSegment(0));
  };

  const moveSegment = (index: number) => {
    if (!scene.scene.isActive()) return;
    const from = nodes[index];
    const to = nodes[index + 1];
    if (!from || !to) return;
    const distance = Math.hypot(to.x - from.x, to.y - from.y);
    const speed = actor.walkSpeed ?? 42;
    const duration = Math.max(520, (distance / speed) * 1000);
    applyRouteFacing(container, from, to, hooks.onFacing);
    moving = true;
    hooks.onState("walking", walkFrame);
    scene.tweens.add({
      targets: container,
      x: to.x,
      y: to.y,
      duration,
      ease: "Linear",
      onUpdate: hooks.onMove,
      onComplete: () => {
        moving = false;
        const reachedHome = index + 1 === nodes.length - 1;
        if (reachedHome) {
          const pending = coordinator.complete(actor.id) as AvatarStatus | undefined;
          const status = pending ?? hooks.getStatus();
          hooks.onHome(status);
          scheduleNext();
          return;
        }
        hooks.onState("standing");
        const pause = 420 + (coordinator.getDelayMs(actor.id, cycle + index) % 481);
        scene.time.delayedCall(pause, () => moveSegment(index + 1));
      },
    });
  };

  scene.events.once("update", scheduleNext);
  return true;
}

/* ------------------------------------------------------------------ */
/*  NPC rendering (office characters)                                  */
/* ------------------------------------------------------------------ */

function drawNPCs(
  s: Phaser.Scene,
  npcs: ZoneDef["npcs"],
  vw: number,
  vh: number,
  walkGraph?: WorkstationsWalkGraph,
) {
  const sx = vw / 960;
  const sy = vh / 540;

  for (const npc of npcs) {
    const visualNpc: NpcDef = npc.routeId ? { ...npc, pose: "walking" } : npc;
    const routeNodes = walkGraph ? resolveRouteNodes(walkGraph, visualNpc) : [];
    const x = routeNodes[0]?.x ?? npc.x * sx;
    const y = routeNodes[0]?.y ?? npc.y * sy;
    const role = workstationRoleFromOutfit(visualNpc.outfit);
    let currentFacing = visualNpc.facing ?? "down";
    const textureKey = resolveWorkstationCharacterKey(role, "standing", 0, currentFacing);
    if (s.textures.exists(textureKey)) {
      const zoneId = walkGraph ? "workstations" : "office";
      const initialLayering = resolveActorLayering(zoneId, y, 48 * sy);
      const container = s.add.container(x, y);
      container.setDepth(initialLayering.actorDepth);
      addCharacterGroundShadow(s, container, 32, 21);
      const sprite = s.add.image(0, 18, textureKey);
      applyWorkstationSpriteState(s, sprite, role, "standing", 0, undefined, currentFacing);
      const characterScale = Math.min(sx, sy) * 0.9;
      container.setScale(characterScale, characterScale);
      // The supplied pixel walk/standing art faces left by default.
      sprite.setFlipX(currentFacing === "right");
      container.add(sprite);
      const indicator = s.add.text(18 * sx, -54 * sy, "💬", { fontSize: "14px" });
      indicator.setOrigin(0.5, 0.5);
      container.add(indicator);
      const nameLabel = strokeText(s, x, initialLayering.labelY, npc.name, "13px", 0.5, 1);
      nameLabel.setDepth(initialLayering.bubbleDepth);
      const hitArea = s.add.rectangle(0, -16, 48 * sx, 58 * sy, 0x000000, 0);
      hitArea.setInteractive({ useHandCursor: true });
      hitArea.on("pointerdown", () => {
        s.game.registry.set("npc-clicked", npc.id);
        s.game.registry.events.emit("npc-clicked", npc.id);
      });
      container.add(hitArea);
      const hasRoute = startRouteLoop(s, container, npc, walkGraph, (frame) => {
        applyWorkstationSpriteState(s, sprite, role, "walking", frame, undefined, currentFacing);
      }, () => {
        const layering = resolveActorLayering(zoneId, container.y, 48 * sy);
        container.setDepth(layering.actorDepth);
        nameLabel.setPosition(container.x, layering.labelY);
      }, (nextFacing) => {
        currentFacing = nextFacing;
        // The supplied side-view art faces left by default.
        sprite.setFlipX(nextFacing === "right");
      });
      if (!hasRoute) container.setAngle(0);
      continue;
    }
    const nc = hex(npc.color);
    const g = s.add.graphics();
    const spec = buildCharacterRenderSpec(visualNpc);
    const facing = npc.facing ?? "down";
    const fx = facing === "left" ? -1 : facing === "right" ? 1 : 0;
    const pose = visualNpc.pose ?? "standing";

    // Container scales the character body; text stays outside at scene coords.
    const container = s.add.container(x, y);
    container.setScale(CHAR_SCALE);

    g.fillStyle(0x000000, 0.18);
    g.fillEllipse(0, 14, spec.shadowWidth, 7);

    g.fillStyle(0x1e293b, 1);
    if (pose === "walking") {
      g.fillRect(-8, -1, 4, spec.legHeight + 1);
      g.fillRect(2, 1, 4, spec.legHeight - 1);
    } else {
      g.fillRect(-5, 0, 4, spec.legHeight - 1);
      g.fillRect(1, 0, 4, spec.legHeight - 1);
    }

    g.fillStyle(nc, 1);
    g.fillRect(-spec.bodyWidth / 2, -12, spec.bodyWidth, spec.bodyHeight);
    g.fillStyle(0xffffff, 0.14);
    g.fillRect(-5, -10, 4, 10);

    g.fillStyle(0xfde68a, 1);
    g.fillCircle(fx * 1.5, -18, spec.headRadius);

    g.fillStyle(0x78350f, 1);
    g.fillCircle(fx, -22, spec.headRadius - 1);
    g.fillRect(-7 + fx, -22, 14, 3);

    if (spec.jacket) {
      g.fillStyle(0x1f2937, 0.55);
      g.fillRect(-spec.bodyWidth / 2, -12, 4, spec.bodyHeight);
    }

    if (spec.lanyard) {
      g.fillStyle(0xf8fafc, 0.9);
      g.fillRect(-1, -10, 2, 6);
    }

    g.fillStyle(0x1e293b, 1);
    if (fx === 0) {
      g.fillCircle(-3, -18, 1);
      g.fillCircle(3, -18, 1);
    } else {
      g.fillCircle(fx * 2, -18, 1.2);
    }

    g.fillStyle(0xfde68a, 1);
    if (pose === "walking") {
      g.fillRect(-10, -10, 3, 10);
      g.fillRect(7, -8, 3, 8);
    } else {
      g.fillRect(-10, -9, 3, 8);
      g.fillRect(7, -9, 3, 8);
    }

    container.add(g);
    drawCharacterDetails(s, container, spec, false);
    addPoseMotion(s, container, spec, false, Boolean(npc.routeId));

    // Speech-bubble indicator (inside container → scaled)
    const indicator = s.add.text(18, -30, "💬", { fontSize: "14px" });
    indicator.setOrigin(0.5, 0.5);
    container.add(indicator);
    s.tweens.add({
      targets: indicator,
      y: -36,
      duration: 600,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });

    // Interactive hit area (inside container → scaled)
    const hitArea = s.add.rectangle(0, -6, 50, 50, 0x000000, 0);
    hitArea.setInteractive({ useHandCursor: true });
    hitArea.on("pointerdown", () => {
      const game = s.game;
      if (game) {
        game.registry.set("npc-clicked", npc.id);
        game.registry.events.emit("npc-clicked", npc.id);
      }
    });
    container.add(hitArea);

    // Name label (scene coords, not scaled)
    const labelOffset = 34 * CHAR_SCALE;
    const nameLabel = strokeText(s, x, y - labelOffset, npc.name, "14px", 0.5, 1);

    const hasRoute = startRouteLoop(s, container, npc, walkGraph, undefined, () => {
      const layering = resolveActorLayering("workstations", container.y, labelOffset);
      container.setDepth(layering.actorDepth);
      nameLabel.setPosition(container.x, layering.labelY);
    });
    if (!hasRoute) {
      // Idle bobbing (container moves in scene space)
      s.tweens.add({
        targets: container,
        y: y - 3,
        duration: 900,
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut",
      });
    }
  }
}

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

function drawCharacterDetails(
  s: Phaser.Scene,
  container: Phaser.GameObjects.Container,
  spec: ReturnType<typeof buildCharacterRenderSpec>,
  seated: boolean,
) {
  const g = s.add.graphics();
  const headY = seated ? -21 : -18;
  const bodyTop = seated ? -15 : -12;

  if (spec.glasses) {
    g.lineStyle(1, 0x0f172a, 1);
    g.strokeRect(-6, headY - 2, 5, 3);
    g.strokeRect(1, headY - 2, 5, 3);
    g.lineBetween(-1, headY, 1, headY);
  }

  if (spec.headset) {
    g.lineStyle(2, 0x0f172a, 1);
    g.strokeCircle(0, headY - 2, spec.headRadius + 2);
    g.fillStyle(0x0f172a, 1);
    g.fillRect(-8, headY - 1, 3, 6);
    g.fillRect(5, headY - 1, 3, 6);
    g.fillRect(6, headY + 5, 7, 2);
  }

  if (spec.cuffColor) {
    g.fillStyle(hex(spec.cuffColor), 1);
    g.fillRect(-12, bodyTop + 5, 4, 3);
    g.fillRect(8, bodyTop + 5, 4, 3);
  }

  if (spec.leadBadge) {
    g.fillStyle(0xfbbf24, 1);
    g.fillCircle(6, bodyTop + 5, 3);
    g.fillStyle(0x78350f, 1);
    g.fillCircle(6, bodyTop + 5, 1);
  }

  container.add(g);
}

function addPoseMotion(
  s: Phaser.Scene,
  container: Phaser.GameObjects.Container,
  spec: ReturnType<typeof buildCharacterRenderSpec>,
  seated: boolean,
  disableTravelTween = false,
) {
  if (spec.motion === "typing") {
    const hands = s.add.graphics();
    hands.fillStyle(0xfde68a, 1);
    hands.fillRect(-12, -8, 4, 3);
    hands.fillRect(8, -8, 4, 3);
    container.add(hands);
    s.tweens.add({
      targets: hands,
      y: 2,
      duration: 180,
      yoyo: true,
      repeat: -1,
      ease: "Steps",
    });
    return;
  }

  if (spec.motion === "talking") {
    const mouth = s.add.graphics();
    mouth.fillStyle(0x7f1d1d, 1);
    mouth.fillRect(-2, seated ? -17 : -14, 4, 1);
    container.add(mouth);
    s.tweens.add({
      targets: mouth,
      alpha: 0.15,
      duration: 260,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });
    return;
  }

  if (spec.motion === "walking") {
    const stride = s.add.graphics();
    stride.fillStyle(0x0f172a, 1);
    stride.fillRect(-8, spec.legHeight - 1, 4, 3);
    stride.fillRect(2, spec.legHeight + 1, 4, 3);
    container.add(stride);
    s.tweens.add({
      targets: stride,
      y: spec.stridePx,
      alpha: 0.45,
      duration: 220,
      yoyo: true,
      repeat: -1,
      ease: "Steps",
    });
    if (!disableTravelTween) {
      s.tweens.add({
        targets: container,
        x: container.x + 10,
        duration: 1400,
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut",
      });
    }
    return;
  }

  if (spec.motion === "focus") {
    const focusDot = s.add.graphics();
    focusDot.fillStyle(0x38bdf8, 0.9);
    focusDot.fillCircle(13, seated ? -28 : -25, 2);
    container.add(focusDot);
    s.tweens.add({
      targets: focusDot,
      alpha: 0.2,
      duration: 900,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });
  }
}

/* ------------------------------------------------------------------ */
/*  Agent rendering (with ID badge and status icon)                    */
/* ------------------------------------------------------------------ */

function drawStatusAura(
  s: Phaser.Scene,
  x: number,
  y: number,
  status: AvatarStatus,
  depth = WORKSTATION_DEPTHS.actor - 1,
) {
  const color = STATUS_AURA_COLOR[status];
  const aura = s.add.graphics();
  aura.setDepth(depth);
  const radius = status === "reviewing" ? 25 : status === "working" ? 23 : 21;
  aura.lineStyle(status === "reviewing" ? 4 : 3, color, 0.82);
  aura.strokeCircle(x, y - 6, radius);
  aura.fillStyle(color, status === "reviewing" ? 0.18 : 0.12);
  aura.fillCircle(x, y - 6, radius - 3);

  if (status === "working") {
    aura.fillStyle(0x93c5fd, 0.85);
    aura.fillRect(x - 12, y - 32, 24, 3);
    aura.fillRect(x - 7, y - 27, 14, 2);
  }

  if (status === "reviewing") {
    aura.lineStyle(2, 0xfbbf24, 0.9);
    aura.strokeRect(x - 18, y - 34, 36, 18);
    aura.fillStyle(0xfbbf24, 0.9);
    aura.fillCircle(x + 15, y - 31, 3);
  }

  // Pulsing animation for active states
  if (status === "working" || status === "reviewing" || status === "online") {
    s.tweens.add({
      targets: aura,
      alpha: 0.4,
      duration: status === "working" ? 400 : 800,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });
  }

  return aura;
}

function createActivityBubble(
  s: Phaser.Scene,
  x: number,
  y: number,
  text: string,
  depth: number = WORKSTATION_DEPTHS.labels,
): { label: Phaser.GameObjects.Text; bg: Phaser.GameObjects.Graphics } {
  const pad = 4;
  const label = s.add.text(x, y, text, {
    color: "#1e293b",
    fontSize: "13px",
    fontFamily: 'monospace',
  });
  label.setOrigin(0.5, 1);
  label.setDepth(depth);

  const bg = s.add.graphics();
  const isReview = text.includes("评审");
  bg.fillStyle(isReview ? 0xfffbeb : 0xecfeff, 0.94);
  bg.fillRoundedRect(
    x - label.width / 2 - pad,
    y - label.height - pad,
    label.width + pad * 2,
    label.height + pad * 2,
    4,
  );
  bg.setDepth(depth - 0.1);

  // Bubble tail
  bg.fillStyle(isReview ? 0xfffbeb : 0xecfeff, 0.94);
  bg.fillTriangle(x - 4, y - 1, x + 4, y - 1, x, y + 4);

  // Gentle bob
  s.tweens.add({
    targets: [label, bg],
    y: "-4",
    duration: 700,
    yoyo: true,
    repeat: -1,
    ease: "Sine.easeInOut",
  });

  return { label, bg };
}

function drawActivityBubble(
  s: Phaser.Scene,
  x: number,
  y: number,
  text: string,
) {
  createActivityBubble(s, x, y, text);
}

function drawAgents(
  s: Phaser.Scene,
  agents: AgentDef[],
  vw: number,
  vh: number,
  zoneDef: ZoneDef,
  avatars?: AgentAvatarState[],
  walkGraph?: WorkstationsWalkGraph,
  motionCoordinator?: WorkstationMotionCoordinator,
) {
  const sx = vw / 960;
  const sy = vh / 540;

  for (let i = 0; i < agents.length; i++) {
    const agent = agents[i];
    const avatar = avatars?.find((a) => a.studentId === agent.studentId);

    // Public spaces are strict: a character is rendered only when the backend
    // confirms an authenticated, currently connected user.
    if (!shouldRenderOnlineAvatar(avatar)) {
      continue;
    }

    const status: AvatarStatus = avatar?.status ?? "online";
    const routeActive = Boolean(agent.routeId);
    const renderAsDeskAgent = Boolean(agent.seated || agent.id === "focus-agent");
    const visualAgent: AgentDef = routeActive
      ? renderAsDeskAgent
        ? { ...agent, seated: true, pose: agent.pose === "standing" ? "focus" : agent.pose }
        : { ...agent, pose: "walking" }
      : agent;
    const routeNodes = walkGraph ? resolveRouteNodes(walkGraph, visualAgent) : [];
    const x = routeNodes[0]?.x ?? agent.x * sx;
    const y = routeNodes[0]?.y ?? agent.y * sy;
    const role = avatar?.visualRole ?? workstationRoleFromOutfit(visualAgent.outfit);
    const initialState = resolveWorkstationVisualState(status, "home");
    let currentFacing: CharacterFacing = visualAgent.facing ?? "down";
    const textureKey = resolveWorkstationCharacterKey(role, "standing", 0, currentFacing);
    const workstation = getWorkstationModelMap(s.game)[agent.id];
    if (walkGraph && renderAsDeskAgent && workstation && s.textures.exists(textureKey)) {
      const initialLayering = resolveActorLayering(zoneDef.id, y, 58 * sy);
      const aura = avatar
        ? drawStatusAura(s, x, y, status, initialLayering.auraDepth)
        : null;
      const container = s.add.container(x, y);
      container.setDepth(initialLayering.actorDepth);
      addCharacterGroundShadow(s, container, 34, 22);
      const sprite = s.add.image(0, 18, textureKey);
      applyWorkstationSpriteState(s, sprite, role, initialState, 0, workstation.placement, currentFacing);
      const characterScale = Math.min(sx, sy);
      container.setScale(resolveSeatedDeskScale(characterScale), characterScale);
      sprite.setFlipX(currentFacing === "right");
      container.add(sprite);
      container.setVisible(status !== "offline");

      const gBadge = s.add.graphics();
      gBadge.fillStyle(0x3b82f6, 1);
      gBadge.fillCircle(18, -42, 6);
      container.add(gBadge);
      const numText = s.add.text(18, -42, String(agent.badgeNum), {
        color: "#fff",
        fontSize: "7px",
        fontFamily: "monospace",
      });
      numText.setOrigin(0.5, 0.5);
      container.add(numText);

      const labelText = formatAgentLabel(avatar, agent.label);
      const labelObj = strokeText(s, x, initialLayering.labelY, labelText, "13px", 0.5, 1);
      labelObj.setDepth(initialLayering.bubbleDepth);
      const refsMap = getAgentRefsMap(s.game);
      if (!refsMap[zoneDef.id]) refsMap[zoneDef.id] = {};
      const refRecord: AgentRefRecord = {
        agentIndex: i,
        originX: x,
        originY: y,
        container,
        aura,
        label: labelObj,
        bubble: null,
        currentStatus: status,
        sprite,
        role,
        facing: currentFacing,
        visualState: initialState,
        walkFrame: 0,
        workstation,
        lastRevision: avatar?.position?.revision,
      };
      refsMap[zoneDef.id][avatar?.studentId ?? agent.id] = refRecord;
      const hasRoute = motionCoordinator
        ? startAgentRouteCycle(s, container, agent, walkGraph, motionCoordinator, {
            getStatus: () => refRecord.currentStatus,
            onState: (state, frame = 0) => {
              setWorkstationOccupancy(s, workstation, "empty");
              container.setVisible(true);
              refRecord.visualState = state;
              refRecord.walkFrame = frame;
              applyWorkstationSpriteState(s, sprite, role, state, frame, workstation.placement, currentFacing);
            },
            onHome: (homeStatus) => {
              refRecord.currentStatus = homeStatus;
              if (homeStatus === "offline") {
                container.setVisible(false);
                setWorkstationOccupancy(s, workstation, "empty");
                return;
              }
              const state = resolveWorkstationVisualState(homeStatus, "home");
              refRecord.visualState = state;
              container.setVisible(true);
              container.setScale(resolveSeatedDeskScale(container.scaleX), Math.abs(container.scaleY));
              container.setAngle(0);
              sprite.setFlipX(currentFacing === "right");
              applyWorkstationSpriteState(s, sprite, role, state, 0, workstation.placement, currentFacing);
              setWorkstationOccupancy(s, workstation, occupiedStateForStatus(homeStatus));
            },
            onMove: () => {
              const layering = resolveActorLayering(zoneDef.id, container.y, 58 * sy);
              container.setDepth(layering.actorDepth);
              labelObj.setPosition(container.x, layering.labelY);
              aura?.setPosition(container.x - x, container.y - y);
            },
            onFacing: (nextFacing) => {
              currentFacing = nextFacing;
              refRecord.facing = nextFacing;
              sprite.setFlipX(nextFacing === "right");
            },
          })
        : false;
      if (!hasRoute) {
        container.setVisible(status !== "offline");
      }
      continue;
    }
    if ((!renderAsDeskAgent || zoneDef.id !== "workstations") && s.textures.exists(textureKey)) {
      const layering = resolveActorLayering(zoneDef.id, y, 34 * sy);
      const aura = avatar
        ? drawStatusAura(s, x, y, status, layering.auraDepth)
        : null;
      const container = s.add.container(x, y);
      container.setDepth(layering.actorDepth);
      container.setScale(Math.min(sx, sy) * 0.9);
      addCharacterGroundShadow(s, container, 32, 22);
      const sprite = s.add.image(0, 18, textureKey);
      const home = role in WORKSTATION_HOME_BY_VISUAL_ROLE
        ? WORKSTATION_HOME_BY_VISUAL_ROLE[
            role as keyof typeof WORKSTATION_HOME_BY_VISUAL_ROLE
          ]
        : undefined;
      const atHome = Boolean(
        home
        && avatar?.position
        && Math.hypot(
          avatar.position.x - home.x,
          avatar.position.y - home.y,
        ) < 1,
      );
      const standaloneInitialState: WorkstationVisualState =
        zoneDef.id === "workstations" && atHome
          ? initialState
          : "standing";
      applyWorkstationSpriteState(
        s,
        sprite,
        role,
        standaloneInitialState,
        0,
        undefined,
        currentFacing,
      );
      sprite.setFlipX(currentFacing === "right");
      container.add(sprite);

      const badge = s.add.graphics();
      badge.fillStyle(0x2563eb, 1);
      badge.fillCircle(18, -42, 7);
      container.add(badge);
      const badgeText = s.add.text(18, -42, String(agent.badgeNum), {
        color: "#fff",
        fontSize: "8px",
        fontFamily: "monospace",
      });
      badgeText.setOrigin(0.5, 0.5);
      container.add(badgeText);

      const labelText = formatAgentLabel(avatar, agent.label);
      const labelObj = strokeText(s, x, layering.labelY, labelText, "13px", 0.5, 1);
      labelObj.setDepth(layering.bubbleDepth);
      const bubbleText = avatar ? STATUS_BUBBLE_TEXT[status] : null;
      const bubbleRef = bubbleText
        ? createActivityBubble(s, x, y - 58 * sy, bubbleText, layering.bubbleDepth)
        : null;
      if (status === "working" || status === "reviewing") {
        s.tweens.add({
          targets: sprite,
          y: status === "working" ? 16 : 17,
          angle: status === "reviewing" ? 1 : 0,
          duration: status === "working" ? 260 : 700,
          yoyo: true,
          repeat: -1,
          ease: "Sine.easeInOut",
        });
      }

      const refsMap = getAgentRefsMap(s.game);
      if (!refsMap[zoneDef.id]) refsMap[zoneDef.id] = {};
      refsMap[zoneDef.id][avatar?.studentId ?? agent.id] = {
        agentIndex: i,
        originX: x,
        originY: y,
        container,
        aura,
        label: labelObj,
        bubble: bubbleRef,
        currentStatus: status,
        sprite,
        role,
        facing: currentFacing,
        visualState: standaloneInitialState,
        lastRevision: avatar?.position?.revision,
      };
      continue;
    }
    const shirtC = hex(agent.shirtColor);
    const hairC = hex(agent.hairColor);
    const g = s.add.graphics();
    const spec = buildCharacterRenderSpec(visualAgent);
    const facing = agent.facing ?? "down";
    const fx = facing === "left" ? -1 : facing === "right" ? 1 : 0;
    const pose = visualAgent.pose ?? (visualAgent.seated ? "typing" : "standing");

    // Status aura (behind character, scene coords — not scaled)
    const aura = avatar ? drawStatusAura(s, x, y, status) : null;

    // Container scales the character body; text stays outside at scene coords.
    const container = s.add.container(x, y);
    container.setScale(CHAR_SCALE);

    g.fillStyle(0x000000, 0.18);
    g.fillEllipse(0, 14, spec.shadowWidth, 7);

    if (visualAgent.seated) {
      g.fillStyle(0x1e293b, 1);
      g.fillEllipse(0, 9, 22, 12);
      g.fillStyle(0x334155, 1);
      g.fillEllipse(0, 6, 18, 8);
      g.fillRect(-8, -2, 16, 4);

      g.fillStyle(0x1e293b, 1);
      g.fillRect(-7, -1, 4, 9);
      g.fillRect(3, 0, 4, 8);

      g.fillStyle(shirtC, 1);
      g.fillRect(-spec.bodyWidth / 2, -15, spec.bodyWidth, spec.bodyHeight + 1);
      g.fillStyle(0xffffff, 0.14);
      g.fillRect(-5, -12, 5, 10);

      g.fillStyle(0xfde68a, 1);
      g.fillCircle(fx * 2, -21, spec.headRadius);

      g.fillStyle(hairC, 1);
      g.fillCircle(fx, -24, spec.headRadius - 1);
      g.fillRect(-7 + fx, -24, 14, 3);

      if (spec.jacket) {
        g.fillStyle(0x1f2937, 0.55);
        g.fillRect(-spec.bodyWidth / 2, -15, 4, spec.bodyHeight + 1);
      }

      if (spec.lanyard) {
        g.fillStyle(0xf8fafc, 0.9);
        g.fillRect(-1, -13, 2, 7);
      }

      g.fillStyle(0x1e293b, 1);
      if (fx === 0) {
        g.fillCircle(-3, -20, 1);
        g.fillCircle(3, -20, 1);
      } else {
        g.fillCircle(fx * 2, -20, 1.2);
      }

      drawDeskArms(g, 0, 0, pose);
    } else {
      g.fillStyle(0x1e293b, 1);
      if (pose === "walking") {
        g.fillRect(-8, -1, 4, spec.legHeight + 1);
        g.fillRect(2, 1, 4, spec.legHeight - 1);
      } else {
        g.fillRect(-5, 0, 4, spec.legHeight - 1);
        g.fillRect(1, 0, 4, spec.legHeight - 1);
      }

      g.fillStyle(shirtC, 1);
      g.fillRect(-spec.bodyWidth / 2, -12, spec.bodyWidth, spec.bodyHeight + 1);
      g.fillStyle(0xffffff, 0.14);
      g.fillRect(-4, -10, 4, 10);

      g.fillStyle(0xfde68a, 1);
      g.fillCircle(fx * 1.5, -18, spec.headRadius);

      g.fillStyle(hairC, 1);
      g.fillCircle(fx, -22, spec.headRadius - 1);
      g.fillRect(-7 + fx, -22, 14, 3);

      if (spec.jacket) {
        g.fillStyle(0x1f2937, 0.55);
        g.fillRect(-spec.bodyWidth / 2, -12, 4, spec.bodyHeight + 1);
      }

      if (spec.lanyard) {
        g.fillStyle(0xf8fafc, 0.9);
        g.fillRect(-1, -10, 2, 6);
      }

      g.fillStyle(0x1e293b, 1);
      if (fx === 0) {
        g.fillCircle(-3, -18, 1);
        g.fillCircle(3, -18, 1);
      } else {
        g.fillCircle(fx * 2, -18, 1.2);
      }

      g.fillStyle(0xfde68a, 1);
      if (pose === "standing") {
        g.fillRect(-11, -8, 4, 8);
        g.fillRect(7, -9, 4, 10);
      } else {
        g.fillRect(-10, -10, 3, 10);
        g.fillRect(7, -8, 3, 8);
      }
    }

    container.add(g);
    drawCharacterDetails(s, container, spec, Boolean(visualAgent.seated));
    addPoseMotion(s, container, spec, Boolean(visualAgent.seated), routeActive);

    // Blue circular ID badge (inside container → scaled)
    const gBadge = s.add.graphics();
    gBadge.fillStyle(0x3b82f6, 1);
    gBadge.fillCircle(16, -28, 8);
    container.add(gBadge);
    // Badge number (8px ÷ 1.5 ≈ 12px visual)
    const numText = s.add.text(16, -28, String(agent.badgeNum), {
      color: "#fff",
      fontSize: "8px",
      fontFamily: 'monospace',
    });
    numText.setOrigin(0.5, 0.5);
    container.add(numText);

    // Status icon (inside container → scaled)
    if (agent.statusIcon) {
      const gIcon = s.add.graphics();
      drawStatusIcon(s, gIcon, -16, -32, agent.statusIcon);
      container.add(gIcon);
    }

    // Label — use avatar display name if available (scene coords, not scaled)
    const labelText = formatAgentLabel(avatar, agent.label);
    const labelObj = strokeText(s, x, y - 40 * CHAR_SCALE, labelText, "14px", 0.5, 1);

    // Tooltip — use avatar activity summary if available (scene coords)
    const tooltipText = avatar?.activitySummary ?? agent.tooltip;
    tooltipBox(s, x - 40, y + 20 * CHAR_SCALE, tooltipText);

    // Activity bubble (for working / reviewing states, scene coords)
    const bubbleText = avatar ? STATUS_BUBBLE_TEXT[status] : null;
    let bubbleRef: AgentRefRecord["bubble"] = null;
    if (bubbleText) {
      const bubbleObjs = createActivityBubble(s, x, y - 46 * CHAR_SCALE, bubbleText);
      bubbleRef = bubbleObjs;
    }

    // Store references for incremental updates (avoid scene restart on status change)
    const refsMap = getAgentRefsMap(s.game);
    if (!refsMap[zoneDef.id]) refsMap[zoneDef.id] = {};
    // Use avatar studentId if available, else fall back to agent.id
    const agentKey = avatar?.studentId ?? agent.id;
    refsMap[zoneDef.id][agentKey] = {
      agentIndex: i,
      originX: x,
      originY: y,
      container,
      aura,
      label: labelObj,
      bubble: bubbleRef,
      currentStatus: status,
    };

    const hasRoute = startRouteLoop(s, container, agent, walkGraph);
    if (!hasRoute) {
      // Idle bobbing — speed depends on status (container moves in scene space)
      const tweenDuration = avatar
        ? STATUS_TWEEN_DURATION[status]
        : 1000;
      s.tweens.add({
        targets: container,
        y: y - 2,
        duration: tweenDuration,
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut",
      });
    }
  }
}

function drawStatusIcon(
  s: Phaser.Scene,
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  icon: "search" | "warning" | "notify" | "ok",
) {
  switch (icon) {
    case "search":
      // Magnifying glass
      g.fillStyle(0x3b82f6, 1);
      g.fillCircle(x, y, 5);
      g.fillStyle(0x93c5fd, 1);
      g.fillCircle(x, y, 3);
      g.fillStyle(0x1e293b, 1);
      g.fillRect(x + 3, y + 3, 2, 4);
      break;
    case "warning":
      // Red warning triangle
      g.fillStyle(0xdc2626, 1);
      g.fillTriangle(x, y - 6, x - 6, y + 4, x + 6, y + 4);
      g.fillStyle(0xffffff, 1);
      g.fillRect(x - 1, y - 2, 2, 3);
      g.fillCircle(x, y + 2, 1);
      break;
    case "notify":
      // Blue notification bubble
      g.fillStyle(0x3b82f6, 1);
      g.fillRoundedRect(x - 5, y - 4, 10, 8, 2);
      g.fillTriangle(x - 2, y + 4, x + 2, y + 4, x, y + 7);
      g.fillStyle(0xffffff, 1);
      g.fillCircle(x, y, 2);
      break;
    case "ok":
      // Green check circle
      g.fillStyle(0x22c55e, 1);
      g.fillCircle(x, y, 5);
      g.fillStyle(0xffffff, 1);
      g.fillRect(x - 3, y, 2, 2);
      g.fillRect(x - 1, y + 1, 2, 2);
      g.fillRect(x + 1, y - 1, 2, 2);
      break;
  }
}

/* ------------------------------------------------------------------ */
/*  Agent incremental-update helpers                                    */
/* ------------------------------------------------------------------ */

function getAgentRefsMap(game: Phaser.Game): AgentRefMap {
  const existing = game.registry.get("__agentRefs__") as AgentRefMap | undefined;
  if (existing) return existing;
  const map: AgentRefMap = {};
  game.registry.set("__agentRefs__", map);
  return map;
}

/**
 * Update a single agent's visual state (aura colour, name label, activity
 * bubble) without destroying and recreating the entire Phaser scene.
 */
function updateAgentVisuals(
  scene: Phaser.Scene,
  studentId: string,
  newStatus: AvatarStatus,
  zoneDef: ZoneDef,
): void {
  const game = scene.game;
  const refsMap = getAgentRefsMap(game);
  const sceneRefs = refsMap[zoneDef.id];
  if (!sceneRefs) return;

  const ref = sceneRefs[studentId];
  if (!ref) return;

  if (
    zoneDef.id === "workstations"
    && (newStatus === "working" || newStatus === "reviewing")
    && ref.currentStatus !== "working"
    && ref.currentStatus !== "reviewing"
  ) {
    // A real task/review lock supersedes any client-side route immediately.
    // The following private avatar:movement event starts the system route home.
    scene.tweens.killTweensOf(ref.container);
  }

  const agent = zoneDef.agents[ref.agentIndex];
  if (!agent) return;

  const motionCoordinator = game.registry.get("__workstationMotionCoordinator__") as
    | WorkstationMotionCoordinator
    | undefined;
  if (motionCoordinator?.isMoving(agent.id)) {
    motionCoordinator.updateStatus(agent.id, newStatus);
    ref.currentStatus = newStatus;
    return;
  }

  const avatars =
    (game.registry.get("agent-avatars") as AgentAvatarState[] | undefined) ?? [];
  const avatar = avatars.find((a) => a.studentId === studentId);

  // If the agent is now offline, hide visuals
  if (avatar?.status === "offline" || newStatus === "offline") {
    ref.container.setVisible(false);
    if (ref.workstation) setWorkstationOccupancy(scene, ref.workstation, "empty");
    ref.aura?.setVisible(false);
    ref.label.setVisible(false);
    if (ref.bubble) {
      ref.bubble.label.destroy();
      ref.bubble.bg.destroy();
      ref.bubble = null;
    }
    ref.currentStatus = "offline";
    return;
  }

  // Keep seated agents visible at their workstation; only their desk screen state changes.
  ref.container.setVisible(true);
  ref.label.setVisible(true);

  const vw = scene.scale.width;
  const vh = scene.scale.height;
  const sx = vw / 960;
  const sy = vh / 540;
  const x = ref.container.x || agent.x * sx;
  const y = ref.container.y || agent.y * sy;
  const layering = resolveActorLayering(zoneDef.id, y, 46 * CHAR_SCALE);

  // Update aura colour
  if (ref.aura) {
    ref.aura.destroy();
  }
  ref.aura = drawStatusAura(scene, x, y, newStatus, layering.auraDepth);
  ref.originX = x;
  ref.originY = y;

  // Update label text
  const displayName = formatAgentLabel(avatar, agent.label);
  ref.label.setText(displayName);

  // Update activity bubble only when status actually changed
  if (ref.currentStatus !== newStatus) {
    if (ref.bubble) {
      ref.bubble.label.destroy();
      ref.bubble.bg.destroy();
      ref.bubble = null;
    }
    const bubbleText = STATUS_BUBBLE_TEXT[newStatus];
    if (bubbleText) {
      const bubbleObjs = createActivityBubble(
        scene,
        x,
        y - 46 * CHAR_SCALE,
        bubbleText,
        layering.bubbleDepth,
      );
      ref.bubble = bubbleObjs;
    }
  }

  ref.currentStatus = newStatus;
  const currentFacing = ref.facing ?? agent.facing ?? "down";
  if (ref.workstation) {
    const state = resolveWorkstationVisualState(newStatus, "home");
    ref.visualState = state;
    ref.container.setScale(resolveSeatedDeskScale(ref.container.scaleX), Math.abs(ref.container.scaleY));
    if (ref.sprite && ref.role) {
      applyWorkstationSpriteState(scene, ref.sprite, ref.role, state, 0, ref.workstation?.placement, currentFacing);
    }
    setWorkstationOccupancy(scene, ref.workstation, occupiedStateForStatus(newStatus));
  } else if (ref.sprite && ref.role) {
    const state = zoneDef.id === "workstations"
      ? resolveWorkstationVisualState(newStatus, "home")
      : "standing";
    ref.visualState = state;
    applyWorkstationSpriteState(scene, ref.sprite, ref.role, state, 0, undefined, currentFacing);
  }
}

/* ------------------------------------------------------------------ */
/*  Workstation rendering                                              */
/* ------------------------------------------------------------------ */

function getWorkstationModelMap(game: Phaser.Game): WorkstationModelMap {
  const existing = game.registry.get("__workstationModels__") as WorkstationModelMap | undefined;
  if (existing) return existing;
  const map: WorkstationModelMap = {};
  game.registry.set("__workstationModels__", map);
  return map;
}

function setWorkstationOccupancy(
  scene: Phaser.Scene,
  ref: WorkstationModelRef,
  occupancy: WorkstationOccupancy,
) {
  ref.screenGlow.clear();
  const color = occupancy === "occupied-active" ? 0x38bdf8 : occupancy === "occupied-idle" ? 0x60a5fa : 0x64748b;
  const alpha = occupancy === "occupied-active" ? 0.48 : occupancy === "occupied-idle" ? 0.24 : 0.1;
  ref.screenRects.forEach((rect) => {
    ref.screenGlow.fillStyle(color, alpha);
    ref.screenGlow.fillRect(rect.x, rect.y, rect.width, rect.height);
  });
  scene.tweens.killTweensOf(ref.screenGlow);
  if (occupancy === "occupied-active") {
    scene.tweens.add({ targets: ref.screenGlow, alpha: 0.35, duration: 360, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
  }
  ref.occupancy = occupancy;
}

function occupiedStateForStatus(status: AvatarStatus): WorkstationOccupancy {
  return status === "working" || status === "reviewing" ? "occupied-active" : "occupied-idle";
}

function drawWorkstation(
  s: Phaser.Scene,
  cx: number,
  cy: number,
  agent?: AgentDef,
) : WorkstationModelRef | undefined {
  const role = workstationRoleFromOutfit(agent?.outfit);
  const deskRole: DeskRole = role === "staff" || role === "visitor" ? "browser" : role;
  const model = buildWorkstationModelManifest()[deskRole];
  if (s.textures.exists(model.rearKey) && s.textures.exists(model.frontKey)) {
    const avatars =
      (s.game.registry.get("agent-avatars") as AgentAvatarState[] | undefined) ?? [];
    const avatar = agent?.studentId
      ? avatars.find((item) => item.studentId === agent.studentId)
      : undefined;
    const occupancy = avatar?.status === "offline" ? "empty" : occupiedStateForStatus(avatar?.status ?? "online");
    const placement = resolveWorkstationPlacement(model, s.scale.width, s.scale.height);
    const deskX = cx;
    const deskY = cy + placement.deskOffsetY;
    const rear = s.add.image(deskX, deskY, model.rearKey)
      .setDisplaySize(placement.deskWidth, placement.deskHeight)
      .setOrigin(model.floorAnchor.x, model.floorAnchor.y)
      .setDepth(WORKSTATION_DEPTHS.rear);
    const front = s.add.image(deskX, deskY, model.frontKey)
      .setDisplaySize(placement.deskWidth, placement.deskHeight)
      .setOrigin(model.floorAnchor.x, model.floorAnchor.y)
      .setDepth(WORKSTATION_DEPTHS.front);
    const textureTop = deskY - placement.deskHeight * model.floorAnchor.y;
    const screenRects = model.screenAnchors.map((anchor) => ({
      x: Math.round(deskX - placement.deskWidth / 2 + placement.deskWidth * anchor.x - 10 * placement.scale),
      y: Math.round(textureTop + placement.deskHeight * anchor.y - 7 * placement.scale),
      width: Math.round(20 * placement.scale),
      height: Math.round(14 * placement.scale),
    }));
    const screenGlow = s.add.graphics().setDepth(WORKSTATION_DEPTHS.rear + 0.1);
    const ref: WorkstationModelRef = { rear, front, screenGlow, role: deskRole, spec: model, placement, screenRects, occupancy };
    setWorkstationOccupancy(s, ref, occupancy);
    if (agent) getWorkstationModelMap(s.game)[agent.id] = ref;
    return ref;
  }

  const textureKey = agent?.id === "focus-agent" ? "desk-lead" : "desk-single";
  if (s.textures.exists(textureKey)) {
    const image = s.add.image(cx, cy + 14, textureKey);
    image.setScale(1);
    return undefined;
  }

  const g = s.add.graphics();
  const avatars =
    (s.game.registry.get("agent-avatars") as AgentAvatarState[] | undefined) ?? [];
  const avatar = agent?.studentId
    ? avatars.find((item) => item.studentId === agent.studentId)
    : undefined;
  const status = avatar?.status ?? "online";
  const screenGlow =
    status === "reviewing" ? 0xfbbf24 : status === "working" ? 0x38bdf8 : 0x3b82f6;

  // Desk (brown, front-left perspective)
  g.fillStyle(0x92400e, 1);
  g.fillRect(cx - 44, cy - 4, 88, 36);
  g.fillStyle(0xb45309, 1);
  g.fillRect(cx - 44, cy - 8, 88, 8);
  g.fillStyle(0x6b3f1f, 1);
  g.fillRect(cx - 44, cy + 26, 88, 10);

  // Desk legs
  g.fillStyle(0x78350f, 1);
  g.fillRect(cx - 38, cy + 32, 7, 16);
  g.fillRect(cx + 31, cy + 32, 7, 16);

  // Monitor(s)
  const monitorCount = agent?.id === "focus-agent" ? 2 : 1;
  for (let i = 0; i < monitorCount; i++) {
    const mx = cx - 26 + i * 38;
    // Monitor stand
    g.fillStyle(0x1e293b, 1);
    g.fillRect(mx + 12, cy - 2, 4, 9);
    // Monitor base
    g.fillRect(mx + 6, cy + 6, 18, 3);
    // Monitor screen
    g.fillStyle(0x0f172a, 1);
    g.fillRect(mx, cy - 30, 30, 24);
    // Screen content mirrors the agent's live status.
    g.fillStyle(screenGlow, status === "idle" ? 0.42 : 0.72);
    g.fillRect(mx + 3, cy - 27, 24, 18);
    // Screen details
    g.fillStyle(status === "reviewing" ? 0xfef3c7 : 0x60a5fa, 0.58);
    g.fillRect(mx + 6, cy - 23, 16, 2);
    g.fillRect(mx + 6, cy - 18, 12, 2);
  }

  if (agent && (status === "working" || status === "reviewing")) {
    const pulse = s.add.graphics();
    pulse.fillStyle(screenGlow, 0.65);
    pulse.fillRect(cx - 18, cy - 22, 36, 3);
    s.tweens.add({
      targets: pulse,
      alpha: 0.2,
      duration: status === "working" ? 320 : 650,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });
  }

  // Keyboard
  g.fillStyle(0x1e293b, 1);
  g.fillRect(cx - 10, cy + 8, 26, 6);
  g.fillStyle(0x334155, 1);
  for (let kx = 0; kx < 6; kx++) {
    g.fillRect(cx - 8 + kx * 4, cy + 9, 3, 2);
  }

  // Mouse
  g.fillStyle(0x1e293b, 1);
  g.fillEllipse(cx + 28, cy + 9, 5, 7);

  // Coffee mug
  g.fillStyle(0xf8fafc, 1);
  g.fillRect(cx - 34, cy + 8, 7, 9);
  g.fillStyle(0x78350f, 1);
  g.fillRect(cx - 33, cy + 9, 5, 2);

  // Papers
  g.fillStyle(0xf8fafc, 1);
  g.fillRect(cx + 18, cy + 14, 16, 11);
  g.fillStyle(0x94a3b8, 0.5);
  g.fillRect(cx + 21, cy + 17, 8, 1);
  g.fillRect(cx + 21, cy + 20, 10, 1);
}

function drawDeskFrontFace(s: Phaser.Scene, cx: number, cy: number) {
  const g = s.add.graphics();
  g.fillStyle(0x78350f, 1);
  g.fillRect(cx - 42, cy + 16, 84, 10);
  g.fillStyle(0x5b3417, 1);
  g.fillRect(cx - 42, cy + 24, 84, 4);
}

function drawWallBand(s: Phaser.Scene, x: number, y: number, width: number, height: number) {
  const g = s.add.graphics();
  g.fillStyle(0xe7e5e4, 1);
  g.fillRect(x, y, width, height);
  g.fillStyle(0x1f2937, 1);
  g.fillRect(x, y - 18, width, 18);
  g.fillStyle(0xf8fafc, 0.9);
  g.fillRect(x, y + height - 8, width, 4);
}

function drawWallFrame(s: Phaser.Scene, cx: number, cy: number, accent: number) {
  const g = s.add.graphics();
  g.fillStyle(0x64748b, 1);
  g.fillRect(cx - 18, cy - 16, 36, 32);
  g.fillStyle(0xf8fafc, 1);
  g.fillRect(cx - 14, cy - 12, 28, 24);
  g.fillStyle(accent, 1);
  g.fillRect(cx - 10, cy - 8, 20, 16);
  g.fillStyle(0xffffff, 0.45);
  g.fillRect(cx - 8, cy - 6, 8, 6);
}

function drawBookshelf(s: Phaser.Scene, cx: number, cy: number) {
  const g = s.add.graphics();
  g.fillStyle(0x475569, 1);
  g.fillRect(cx - 22, cy - 28, 44, 56);
  g.fillStyle(0x94a3b8, 1);
  g.fillRect(cx - 18, cy - 8, 36, 3);
  g.fillRect(cx - 18, cy + 10, 36, 3);
  g.fillStyle(0x22c55e, 1);
  g.fillRect(cx - 16, cy - 22, 8, 12);
  g.fillStyle(0xf59e0b, 1);
  g.fillRect(cx - 4, cy - 22, 8, 12);
  g.fillStyle(0x3b82f6, 1);
  g.fillRect(cx + 8, cy - 22, 8, 12);
  g.fillStyle(0x60a5fa, 1);
  g.fillRect(cx - 12, cy - 2, 6, 10);
  g.fillStyle(0xf97316, 1);
  g.fillRect(cx - 2, cy - 2, 6, 10);
  g.fillStyle(0xa855f7, 1);
  g.fillRect(cx + 8, cy - 2, 6, 10);
}

function drawPottedPlant(s: Phaser.Scene, cx: number, cy: number) {
  const g = s.add.graphics();
  g.fillStyle(0x94a3b8, 1);
  g.fillRect(cx - 8, cy + 4, 16, 12);
  g.fillStyle(0x16a34a, 1);
  g.fillCircle(cx, cy, 12);
  g.fillCircle(cx - 8, cy + 4, 7);
  g.fillCircle(cx + 8, cy + 4, 7);
}

function drawWaterCooler(s: Phaser.Scene, cx: number, cy: number) {
  if (s.textures.exists("water-cooler")) {
    s.add.image(cx, cy, "water-cooler");
    return;
  }
  const g = s.add.graphics();
  g.fillStyle(0x334155, 1);
  g.fillRect(cx - 12, cy - 20, 24, 38);
  g.fillStyle(0x60a5fa, 0.85);
  g.fillCircle(cx, cy - 24, 10);
  g.fillStyle(0x0f172a, 1);
  g.fillRect(cx - 5, cy - 4, 10, 4);
}

function drawStorageCabinet(s: Phaser.Scene, cx: number, cy: number) {
  const g = s.add.graphics();
  g.fillStyle(0x475569, 1);
  g.fillRect(cx - 18, cy - 22, 36, 44);
  g.fillStyle(0x64748b, 1);
  g.fillRect(cx - 14, cy - 18, 28, 36);
  g.fillStyle(0xf8fafc, 0.8);
  g.fillRect(cx - 10, cy - 4, 20, 2);
}

function drawLoungeFloor(
  s: Phaser.Scene,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  const g = s.add.graphics();
  g.fillStyle(0xd6c29c, 1);
  g.fillRect(x, y, width, height);
  g.fillStyle(0xb08968, 0.45);
  for (let i = 0; i < width; i += 18) {
    g.fillRect(x + i, y, 10, height);
  }
  g.fillStyle(0xe5d5b3, 1);
  g.fillRect(x, y - 14, width, 14);
  g.fillStyle(0x94a3b8, 1);
  g.fillRect(x - 12, y - 10, width + 24, 10);
  g.fillStyle(0x000000, 0.08);
  g.fillRect(x + 8, y + height - 12, width - 16, 8);
}

function drawWorkstationsRoomShell(
  s: Phaser.Scene,
  layout: WorkstationsLayout,
  sx: number,
  sy: number,
) {
  const r = layout.roomRect;
  const g = s.add.graphics();
  g.fillStyle(0x111827, 1);
  g.fillRoundedRect((r.x - 8) * sx, (r.y - 8) * sy, (r.width + 16) * sx, (r.height + 16) * sy, 10);
  g.fillStyle(0xb9895c, 1);
  g.fillRoundedRect(r.x * sx, r.y * sy, r.width * sx, r.height * sy, 8);
  g.fillStyle(0xd8b58a, 1);
  g.fillRoundedRect((r.x + 8) * sx, (r.y + 8) * sy, (r.width - 16) * sx, (r.height - 16) * sy, 6);
  g.fillStyle(0xd1d5db, 1);
  g.fillRect((r.x + 22) * sx, (r.y + 22) * sy, 526 * sx, 438 * sy);
  g.fillStyle(0xe5e7eb, 1);
  g.fillRect((r.x + 30) * sx, (r.y + 30) * sy, 510 * sx, 420 * sy);

  g.lineStyle(1, 0xcbd5e1, 0.7);
  for (let x = r.x + 34; x < 548; x += 20) {
    g.lineBetween(x * sx, (r.y + 34) * sy, x * sx, (r.y + 452) * sy);
  }
  for (let y = r.y + 34; y < r.y + 452; y += 20) {
    g.lineBetween((r.x + 34) * sx, y * sy, 548 * sx, y * sy);
  }
}

function drawTopInfoPanel(
  s: Phaser.Scene,
  panel: WorkstationsLayout["topPanels"][number],
  sx: number,
  sy: number,
) {
  const x = panel.x * sx;
  const y = panel.y * sy;
  const w = panel.width * sx;
  const h = panel.height * sy;
  const g = s.add.graphics();
  g.fillStyle(0x1f2937, 1);
  g.fillRoundedRect(x - w / 2, y - h / 2, w, h, 4);
  g.fillStyle(0x0f172a, 1);
  g.fillRect(x - w / 2 + 4, y - h / 2 + 4, w - 8, h - 8);
  g.lineStyle(2, 0x8b5a2b, 1);
  g.strokeRoundedRect(x - w / 2, y - h / 2, w, h, 4);
  strokeText(s, x, y - h / 2 + 16 * sy, panel.label, "10px", 0.5, 0.5);

  if (panel.id === "agent-guild") {
    g.lineStyle(3, 0xe5e7eb, 1);
    g.lineBetween(x - 18 * sx, y + 12 * sy, x + 18 * sx, y - 14 * sy);
    g.lineBetween(x - 18 * sx, y - 14 * sy, x + 18 * sx, y + 12 * sy);
    g.fillStyle(0xfbbf24, 1);
    g.fillCircle(x - 18 * sx, y - 14 * sy, 3 * sx);
    g.fillCircle(x + 18 * sx, y - 14 * sy, 3 * sx);
    return;
  }

  if (panel.id === "task-board") {
    const colors = [0xfacc15, 0xfacc15, 0x60a5fa, 0x60a5fa, 0xfde68a, 0xfde68a, 0xf472b6];
    colors.forEach((color, index) => {
      const col = index % 4;
      const row = Math.floor(index / 4);
      g.fillStyle(color, 1);
      g.fillRect(x - 50 * sx + col * 28 * sx, y - 4 * sy + row * 18 * sy, 18 * sx, 12 * sy);
    });
    return;
  }

  if (panel.id === "status") {
    const rows = [
      ["Tasks", 0x22c55e, "12"],
      ["In Progress", 0x38bdf8, "5"],
      ["Review", 0xa855f7, "3"],
      ["Blocked", 0xef4444, "1"],
    ];
    rows.forEach(([label, color, value], index) => {
      const yy = y - 10 * sy + index * 12 * sy;
      const text = s.add.text(x - 42 * sx, yy, String(label), { color: `#${Number(color).toString(16).padStart(6, "0")}`, fontSize: "9px", fontFamily: "monospace" });
      text.setOrigin(0, 0.5);
      const val = s.add.text(x + 42 * sx, yy, String(value), { color: `#${Number(color).toString(16).padStart(6, "0")}`, fontSize: "9px", fontFamily: "monospace" });
      val.setOrigin(1, 0.5);
    });
    return;
  }

  const items = ["Daily Standup  10:00", "Review Time   16:00", "Training New Agent"];
  items.forEach((item, index) => {
    const text = s.add.text(x - 52 * sx, y - 4 * sy + index * 12 * sy, `• ${item}`, {
      color: "#e5e7eb",
      fontSize: "8px",
      fontFamily: "monospace",
    });
    text.setOrigin(0, 0.5);
  });
}

function drawNumberBadge(s: Phaser.Scene, x: number, y: number, label: string, color: number) {
  const g = s.add.graphics();
  g.fillStyle(color, 1);
  g.fillCircle(x, y, 9);
  const t = s.add.text(x, y, label, { color: "#fff", fontSize: "11px", fontFamily: "monospace", fontStyle: "700" });
  t.setOrigin(0.5, 0.5);
}

function drawDashedPath(
  s: Phaser.Scene,
  points: Array<{ x: number; y: number }>,
  color: number,
  sx: number,
  sy: number,
) {
  const g = s.add.graphics();
  g.lineStyle(2, color, 0.9);
  for (let i = 0; i < points.length - 1; i++) {
    const from = { x: points[i].x * sx, y: points[i].y * sy };
    const to = { x: points[i + 1].x * sx, y: points[i + 1].y * sy };
    const distance = Math.hypot(to.x - from.x, to.y - from.y);
    const dash = 8;
    const gap = 6;
    const steps = Math.max(1, Math.floor(distance / (dash + gap)));
    for (let step = 0; step <= steps; step++) {
      const startT = (step * (dash + gap)) / distance;
      const endT = Math.min(startT + dash / distance, 1);
      if (startT >= 1) continue;
      g.lineBetween(
        from.x + (to.x - from.x) * startT,
        from.y + (to.y - from.y) * startT,
        from.x + (to.x - from.x) * endT,
        from.y + (to.y - from.y) * endT,
      );
    }
  }
}

function drawWorkstationRouteOverlay(s: Phaser.Scene, sx: number, sy: number) {
  drawDashedPath(s, [{ x: 88, y: 250 }, { x: 258, y: 250 }, { x: 258, y: 392 }, { x: 360, y: 392 }, { x: 360, y: 250 }, { x: 316, y: 250 }], 0x1e90ff, sx, sy);
  drawDashedPath(s, [{ x: 440, y: 122 }, { x: 440, y: 360 }, { x: 468, y: 414 }], 0x65c64c, sx, sy);
  drawDashedPath(s, [{ x: 568, y: 248 }, { x: 624, y: 248 }, { x: 624, y: 374 }, { x: 884, y: 374 }, { x: 884, y: 248 }, { x: 758, y: 248 }], 0xff9f1a, sx, sy);
  drawDashedPath(s, [{ x: 482, y: 474 }, { x: 692, y: 474 }, { x: 724, y: 492 }, { x: 820, y: 492 }, { x: 820, y: 438 }], 0x8b5cf6, sx, sy);
  drawNumberBadge(s, 92 * sx, 170 * sy, "1", 0x1e90ff);
  drawNumberBadge(s, 468 * sx, 128 * sy, "2", 0x65c64c);
  drawNumberBadge(s, 590 * sx, 244 * sy, "3", 0xff9f1a);
  drawNumberBadge(s, 482 * sx, 492 * sy, "4", 0x8b5cf6);
}

function drawReferenceLegends(
  s: Phaser.Scene,
  layout: WorkstationsLayout,
  sx: number,
  sy: number,
) {
  const drawPanel = (x: number, y: number, w: number, h: number, title: string) => {
    const g = s.add.graphics();
    g.fillStyle(0x111827, 0.88);
    g.fillRoundedRect(x * sx, y * sy, w * sx, h * sy, 8);
    g.lineStyle(2, 0x64748b, 1);
    g.strokeRoundedRect(x * sx, y * sy, w * sx, h * sy, 8);
    strokeText(s, (x + 12) * sx, (y + 14) * sy, title, "10px", 0, 0.5);
  };

  drawPanel(layout.routeLegend.x, layout.routeLegend.y, layout.routeLegend.width, layout.routeLegend.height, "PATH ROUTES");
  [
    ["1", "Work Loop", 0x1e90ff],
    ["2", "Task Check", 0x65c64c],
    ["3", "Break / Lounge", 0xff9f1a],
    ["4", "Review Loop", 0x8b5cf6],
  ].forEach(([num, label, color], index) => {
    const y = layout.routeLegend.y + 34 + index * 18;
    drawNumberBadge(s, (layout.routeLegend.x + 18) * sx, y * sy, String(num), Number(color));
    const t = s.add.text((layout.routeLegend.x + 34) * sx, (y - 5) * sy, String(label), { color: "#fff", fontSize: "9px", fontFamily: "monospace" });
    t.setOrigin(0, 0);
  });

  drawPanel(layout.behaviorLegend.x, layout.behaviorLegend.y, layout.behaviorLegend.width, layout.behaviorLegend.height, "AGENT BEHAVIOR");
  [
    ["1", "Auto work on assigned tasks", 0x1e90ff],
    ["2", "Check task board updates", 0x65c64c],
    ["3", "Take breaks in lounge", 0xff9f1a],
    ["4", "Submit for review", 0x8b5cf6],
  ].forEach(([num, label, color], index) => {
    const y = layout.behaviorLegend.y + 30 + index * 15;
    drawNumberBadge(s, (layout.behaviorLegend.x + 16) * sx, y * sy, String(num), Number(color));
    const t = s.add.text((layout.behaviorLegend.x + 30) * sx, (y - 5) * sy, String(label), { color: "#fff", fontSize: "8px", fontFamily: "monospace" });
    t.setOrigin(0, 0);
  });
}

function drawWorkstationsCorridor(
  s: Phaser.Scene,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  const g = s.add.graphics();
  g.fillStyle(0xcbd5e1, 0.55);
  g.fillRoundedRect(x, y, width, height, 12);
  g.lineStyle(2, 0xf8fafc, 0.62);
  g.lineBetween(x + width / 2, y + 16, x + width / 2, y + height - 16);
  g.fillStyle(0x94a3b8, 0.42);
  for (let yy = y + 26; yy < y + height - 20; yy += 54) {
    g.fillRect(x + 18, yy, width - 36, 3);
  }
  g.lineStyle(2, 0x94a3b8, 0.5);
  g.strokeCircle(x + width / 2, y + height / 2, Math.min(width, height) * 0.28);
  g.lineStyle(5, 0xffffff, 0.28);
  g.lineBetween(x + width / 2 - 22, y + height / 2 - 18, x + width / 2 + 22, y + height / 2 + 18);
  g.lineBetween(x + width / 2 + 22, y + height / 2 - 18, x + width / 2 - 22, y + height / 2 + 18);
}

function drawReviewDoor(s: Phaser.Scene, cx: number, cy: number) {
  if (s.textures.exists("review-door")) {
    s.add.image(cx, cy - 4, "review-door");
    strokeText(s, cx, cy - 58, "REVIEW ROOM", "10px", 0.5, 0.5);
    return;
  }
  const g = s.add.graphics();
  g.fillStyle(0x111827, 1);
  g.fillRect(cx - 36, cy - 48, 72, 88);
  g.fillStyle(0x334155, 1);
  g.fillRect(cx - 30, cy - 42, 60, 12);
  g.fillStyle(0x4c1d95, 1);
  g.fillRect(cx - 26, cy - 28, 52, 62);
  g.fillStyle(0x7c3aed, 0.86);
  g.fillRect(cx - 22, cy - 24, 44, 54);
  g.fillStyle(0x1e1b4b, 0.7);
  g.fillRect(cx - 20, cy + 22, 40, 8);
  strokeText(s, cx, cy - 50, "REVIEW ROOM", "10px", 0.5, 0.5);
}

function drawReviewRoomBlock(
  s: Phaser.Scene,
  rect: WorkstationsLayout["reviewRoom"],
  sx: number,
  sy: number,
) {
  const g = s.add.graphics();
  g.fillStyle(0x9ca3af, 1);
  g.fillRect(rect.x * sx, rect.y * sy, rect.width * sx, rect.height * sy);
  g.fillStyle(0x6b7280, 1);
  g.fillRect(rect.x * sx, rect.y * sy, rect.width * sx, 14 * sy);
  g.fillRect(rect.x * sx, rect.y * sy, 12 * sx, rect.height * sy);
  g.fillStyle(0x4b5563, 1);
  g.fillRect((rect.x + 12) * sx, (rect.y + 14) * sy, (rect.width - 24) * sx, (rect.height - 14) * sy);
  drawPottedPlant(s, (rect.x + 18) * sx, (rect.y + 80) * sy);
  drawPottedPlant(s, (rect.x + rect.width - 18) * sx, (rect.y + 80) * sy);
}

function drawLoungePartition(
  s: Phaser.Scene,
  x: number,
  y: number,
  width: number,
) {
  const g = s.add.graphics();
  g.fillStyle(0xcbd5e1, 1);
  g.fillRect(x, y, width, 18);
  g.fillStyle(0x94a3b8, 1);
  g.fillRect(x, y - 10, width, 10);
  g.fillStyle(0x64748b, 0.25);
  g.fillRect(x, y + 18, width, 5);
}

function drawLoungeSofa(s: Phaser.Scene, cx: number, cy: number) {
  if (s.textures.exists("lounge-sofa")) {
    s.add.image(cx, cy, "lounge-sofa");
    return;
  }
  const g = s.add.graphics();
  g.fillStyle(0x334155, 1);
  g.fillRect(cx - 30, cy - 16, 60, 32);
  g.fillRect(cx - 30, cy - 16, 18, 48);
  g.fillRect(cx + 12, cy - 16, 18, 48);
  g.fillStyle(0x64748b, 1);
  g.fillRect(cx - 24, cy - 10, 48, 20);
}

function drawOfficeDisplay(s: Phaser.Scene, cx: number, cy: number, label: string) {
  const g = s.add.graphics();
  g.fillStyle(0x475569, 1);
  g.fillRect(cx - 34, cy - 18, 68, 36);
  g.fillStyle(0xf8fafc, 1);
  g.fillRect(cx - 30, cy - 14, 60, 28);
  g.lineStyle(2, 0xef4444, 1);
  g.beginPath();
  g.moveTo(cx - 22, cy + 8);
  g.lineTo(cx - 10, cy);
  g.lineTo(cx + 2, cy + 4);
  g.lineTo(cx + 14, cy - 8);
  g.strokePath();
  g.fillStyle(0x3b82f6, 1);
  g.fillCircle(cx + 18, cy - 10, 4);
  strokeText(s, cx, cy + 30, label, "12px", 0.5, 0);
}

function drawPixelSign(s: Phaser.Scene, cx: number, cy: number, text: string) {
  const g = s.add.graphics();
  g.fillStyle(0x6b7280, 1);
  g.fillRect(cx - 46, cy - 18, 92, 36);
  g.fillStyle(0xf5f5f4, 1);
  g.fillRect(cx - 42, cy - 14, 84, 28);
  const sign = s.add.text(cx, cy, text, {
    color: "#111827",
    fontSize: "12px",
    fontFamily: 'monospace',
  });
  sign.setOrigin(0.5, 0.5);
}

/* ------------------------------------------------------------------ */
/*  Landmark rendering (office-themed)                                 */
/* ------------------------------------------------------------------ */

function drawAnnouncementBoard(s: Phaser.Scene, cx: number, cy: number) {
  const g = s.add.graphics();
  // Frame
  g.fillStyle(0x78350f, 1);
  g.fillRect(cx - 3, cy, 6, 28);
  // Board
  g.fillStyle(0x92400e, 1);
  g.fillRect(cx - 32, cy - 28, 64, 44);
  g.fillStyle(0xb45309, 1);
  g.fillRect(cx - 28, cy - 24, 56, 36);
  // Pinned notes
  g.fillStyle(0xfef3c7, 1);
  g.fillRect(cx - 22, cy - 20, 18, 14);
  g.fillRect(cx + 4, cy - 20, 18, 14);
  g.fillRect(cx - 12, cy, 20, 10);
  // Pins
  g.fillStyle(0xdc2626, 1);
  g.fillCircle(cx - 13, cy - 18, 2);
  g.fillCircle(cx + 13, cy - 18, 2);
  // Text lines
  g.fillStyle(0x6b7280, 0.6);
  g.fillRect(cx - 18, cy - 16, 10, 2);
  g.fillRect(cx - 18, cy - 12, 8, 2);
  g.fillRect(cx + 8, cy - 16, 10, 2);
  g.fillRect(cx + 8, cy - 12, 8, 2);
  strokeText(s, cx, cy + 32, "公告板", "14px", 0.5, 0);
}

function drawCoffeeStation(s: Phaser.Scene, cx: number, cy: number) {
  if (s.textures.exists("coffee-counter")) {
    s.add.image(cx, cy, "coffee-counter");
    strokeText(s, cx, cy + 36, "COFFEE CORNER", "11px", 0.5, 0);
    return;
  }
  const g = s.add.graphics();
  // Counter
  g.fillStyle(0x92400e, 1);
  g.fillRect(cx - 36, cy - 4, 72, 24);
  g.fillStyle(0xb45309, 1);
  g.fillRect(cx - 36, cy - 4, 72, 4);
  // Coffee machine
  g.fillStyle(0x1e293b, 1);
  g.fillRect(cx - 28, cy - 24, 20, 20);
  g.fillStyle(0x3b82f6, 1);
  g.fillRect(cx - 26, cy - 22, 16, 12);
  g.fillStyle(0x60a5fa, 0.7);
  g.fillRect(cx - 24, cy - 20, 12, 8);
  // Cups
  g.fillStyle(0xf8fafc, 1);
  g.fillRect(cx + 8, cy - 12, 8, 8);
  g.fillRect(cx + 20, cy - 12, 8, 8);
  // Steam
  g.fillStyle(0xe5e7eb, 0.4);
  g.fillCircle(cx - 18, cy - 28, 3);
  g.fillCircle(cx - 14, cy - 32, 2);
  strokeText(s, cx, cy + 28, "咖啡角", "14px", 0.5, 0);
}

function drawStatusPanel(s: Phaser.Scene, cx: number, cy: number) {
  const g = s.add.graphics();
  // Panel frame
  g.fillStyle(0x1e293b, 1);
  g.fillRect(cx - 50, cy - 30, 100, 60);
  g.fillStyle(0x334155, 1);
  g.fillRect(cx - 46, cy - 26, 92, 52);
  // Status bars
  const statuses = [
    { label: "Browser", color: 0x3b82f6, w: 60 },
    { label: "Coder", color: 0x22c55e, w: 45 },
    { label: "Files", color: 0xa855f7, w: 30 },
  ];
  for (let i = 0; i < statuses.length; i++) {
    const sy = cy - 18 + i * 16;
    g.fillStyle(0x475569, 1);
    g.fillRect(cx - 40, sy, 80, 8);
    g.fillStyle(statuses[i].color, 1);
    g.fillRect(cx - 40, sy, statuses[i].w, 8);
  }
  // Indicator dots
  g.fillStyle(0x22c55e, 1);
  g.fillCircle(cx + 36, cy - 14, 3);
  g.fillCircle(cx + 36, cy + 2, 3);
  g.fillStyle(0xfbbf24, 1);
  g.fillCircle(cx + 36, cy + 18, 3);
  strokeText(s, cx, cy + 38, "状态面板", "14px", 0.5, 0);
}

function drawWhiteboard(s: Phaser.Scene, cx: number, cy: number) {
  const g = s.add.graphics();
  // Frame
  g.fillStyle(0x94a3b8, 1);
  g.fillRect(cx - 52, cy - 36, 104, 68);
  // Board surface
  g.fillStyle(0xf8fafc, 1);
  g.fillRect(cx - 48, cy - 32, 96, 60);
  // Chart lines (line graph)
  g.fillStyle(0x3b82f6, 1);
  g.fillRect(cx - 40, cy - 20, 2, 40);
  g.fillRect(cx - 40, cy + 18, 76, 2);
  // Data points
  const points = [
    [-30, 10], [-15, -5], [0, 5], [15, -10], [30, -15],
  ];
  g.fillStyle(0xdc2626, 1);
  for (const [px, py] of points) {
    g.fillCircle(cx + px, cy + py, 3);
  }
  // Connecting lines
  g.lineStyle(2, 0xdc2626, 1);
  g.beginPath();
  g.moveTo(cx + points[0][0], cy + points[0][1]);
  for (let i = 1; i < points.length; i++) {
    g.lineTo(cx + points[i][0], cy + points[i][1]);
  }
  g.strokePath();
  // Pie chart (small)
  g.fillStyle(0x3b82f6, 1);
  g.fillCircle(cx + 30, cy - 16, 8);
  g.fillStyle(0x22c55e, 1);
  g.fillTriangle(cx + 30, cy - 16, cx + 38, cy - 16, cx + 30, cy - 24);
  strokeText(s, cx, cy + 40, "协作白板", "14px", 0.5, 0);
}

function drawRoundTableMeeting(s: Phaser.Scene, cx: number, cy: number) {
  const g = s.add.graphics();
  // Table
  g.fillStyle(0x78350f, 1);
  g.fillEllipse(cx, cy + 4, 80, 24);
  g.fillStyle(0x92400e, 1);
  g.fillEllipse(cx, cy, 76, 20);
  // Table leg
  g.fillStyle(0x78350f, 1);
  g.fillRect(cx - 4, cy + 10, 8, 18);
  // Chairs
  const chairs = [
    [-40, -8], [40, -8], [-28, -18], [28, -18], [-28, 16], [28, 16],
  ];
  for (const [dx, dy] of chairs) {
    g.fillStyle(0x1e293b, 1);
    g.fillCircle(cx + dx, cy + dy, 8);
    g.fillStyle(0x334155, 1);
    g.fillCircle(cx + dx, cy + dy, 6);
  }
  // Documents on table
  g.fillStyle(0xf8fafc, 1);
  g.fillRect(cx - 16, cy - 6, 12, 8);
  g.fillRect(cx + 4, cy - 6, 12, 8);
  g.fillStyle(0x94a3b8, 0.5);
  g.fillRect(cx - 14, cy - 4, 8, 1);
  g.fillRect(cx + 6, cy - 4, 8, 1);
  strokeText(s, cx, cy + 36, "圆桌会议", "14px", 0.5, 0);
}

function drawTaskBoard(s: Phaser.Scene, cx: number, cy: number) {
  const g = s.add.graphics();
  // Board frame
  g.fillStyle(0x78350f, 1);
  g.fillRect(cx - 6, cy + 12, 12, 22);
  g.fillStyle(0x92400e, 1);
  g.fillRect(cx - 48, cy - 32, 96, 58);
  g.fillStyle(0xb45309, 1);
  g.fillRect(cx - 44, cy - 28, 88, 50);
  // Task cards (sticky notes)
  const cards = [
    { x: -36, y: -24, c: 0xfef3c7 },
    { x: -16, y: -24, c: 0xfde68a },
    { x: 4, y: -24, c: 0xfef3c7 },
    { x: 24, y: -24, c: 0xfde68a },
    { x: -26, y: 0, c: 0xfef3c7 },
    { x: -6, y: 0, c: 0xfde68a },
    { x: 14, y: 0, c: 0xfef3c7 },
  ];
  for (const card of cards) {
    g.fillStyle(card.c, 1);
    g.fillRect(cx + card.x, cy + card.y, 16, 18);
    g.fillStyle(0x6b7280, 0.5);
    g.fillRect(cx + card.x + 2, cy + card.y + 4, 12, 2);
    g.fillRect(cx + card.x + 2, cy + card.y + 8, 10, 2);
    // Pin
    g.fillStyle(0xdc2626, 1);
    g.fillCircle(cx + card.x + 8, cy + card.y + 1, 2);
  }
  strokeText(s, cx, cy + 40, "任务看板", "14px", 0.5, 0);
}

function drawReviewDesk(s: Phaser.Scene, cx: number, cy: number) {
  const g = s.add.graphics();
  // Desk
  g.fillStyle(0x475569, 1);
  g.fillRect(cx - 40, cy - 8, 80, 32);
  g.fillStyle(0x64748b, 1);
  g.fillRect(cx - 40, cy - 8, 80, 4);
  // Desk legs
  g.fillStyle(0x334155, 1);
  g.fillRect(cx - 36, cy + 24, 6, 12);
  g.fillRect(cx + 30, cy + 24, 6, 12);
  // Monitor (review screen)
  g.fillStyle(0x0f172a, 1);
  g.fillRect(cx - 24, cy - 28, 48, 20);
  g.fillStyle(0x22c55e, 0.6);
  g.fillRect(cx - 22, cy - 26, 44, 16);
  // Checkmarks on screen
  g.fillStyle(0xffffff, 1);
  g.fillRect(cx - 18, cy - 22, 8, 2);
  g.fillRect(cx - 6, cy - 22, 8, 2);
  g.fillRect(cx + 6, cy - 22, 8, 2);
  // Monitor stand
  g.fillStyle(0x1e293b, 1);
  g.fillRect(cx - 4, cy - 8, 8, 4);
  // Keyboard
  g.fillStyle(0x1e293b, 1);
  g.fillRect(cx - 16, cy + 2, 32, 6);
  // Documents
  g.fillStyle(0xf8fafc, 1);
  g.fillRect(cx - 36, cy + 2, 14, 16);
  g.fillRect(cx + 22, cy + 2, 14, 16);
  g.fillStyle(0xdc2626, 1);
  g.fillCircle(cx - 29, cy + 4, 2);
  g.fillStyle(0x22c55e, 1);
  g.fillCircle(cx + 29, cy + 4, 2);
  strokeText(s, cx, cy + 42, "评审工作台", "14px", 0.5, 0);
}

const LANDMARK_DRAW: Record<
  string,
  (s: Phaser.Scene, x: number, y: number) => void
> = {
  "公告板": drawAnnouncementBoard,
  "咖啡角": drawCoffeeStation,
  "状态面板": drawStatusPanel,
  "协作白板": drawWhiteboard,
  "圆桌会议": drawRoundTableMeeting,
  "任务看板": drawTaskBoard,
  "评审工作台": drawReviewDesk,
  "顶部展示墙": () => undefined,
  "中心工位": () => undefined,
  "休息区": () => undefined,
};

function drawReplicatedWorkstationsScene(scene: Phaser.Scene, zone: ZoneDef, vw: number, vh: number) {
  const layout = buildWorkstationsLayout(vw, vh);
  const sx = vw / 960;
  const sy = vh / 540;
  const seatedAgents = zone.agents.filter((agent) => agent.seated);

  drawWorkstationsRoomShell(scene, layout, sx, sy);
  drawWallBand(scene, layout.wallBand.x * sx, layout.wallBand.y * sy, layout.wallBand.width * sx, layout.wallBand.height * sy);
  layout.topPanels.forEach((panel) => drawTopInfoPanel(scene, panel, sx, sy));
  drawPottedPlant(scene, 104 * sx, 88 * sy);
  drawStorageCabinet(scene, 250 * sx, 92 * sy);
  drawWallFrame(scene, 690 * sx, 88 * sy, 0x60a5fa);
  drawBookshelf(scene, 752 * sx, 92 * sy);
  drawWorkstationsCorridor(
    scene,
    layout.corridorRect.x * sx,
    layout.corridorRect.y * sy,
    layout.corridorRect.width * sx,
    layout.corridorRect.height * sy,
  );

  drawLoungeFloor(
    scene,
    layout.loungeRect.x * sx,
    layout.loungeRect.y * sy,
    layout.loungeRect.width * sx,
    layout.loungeRect.height * sy,
  );
  drawLoungePartition(scene, layout.loungeRect.x * sx, (layout.loungeRect.y - 8) * sy, layout.loungeRect.width * sx);
  drawLoungeSofa(scene, 744 * sx, 174 * sy);
  drawCoffeeStation(scene, 744 * sx, 306 * sy);
  drawWaterCooler(scene, 858 * sx, 258 * sy);
  drawStorageCabinet(scene, 848 * sx, 342 * sy);
  drawPottedPlant(scene, 594 * sx, 192 * sy);
  drawPottedPlant(scene, 888 * sx, 196 * sy);
  drawPottedPlant(scene, 888 * sx, 342 * sy);
  drawReviewRoomBlock(scene, layout.reviewRoom, sx, sy);
  drawReviewDoor(scene, layout.reviewDoor.x * sx, layout.reviewDoor.y * sy);
  const visualConfig = buildWorkstationVisualConfig();
  if (visualConfig.showRouteOverlay) drawWorkstationRouteOverlay(scene, sx, sy);
  if (visualConfig.showRouteLegends) drawReferenceLegends(scene, layout, sx, sy);

  layout.doubleDeskAnchors.forEach((anchor, index) => {
    drawWorkstation(scene, anchor.x * sx, anchor.y * sy, seatedAgents[index]);
  });
  drawWorkstation(scene, layout.focusDesk.x * sx, layout.focusDesk.y * sy, zone.agents.find((agent) => agent.id === "focus-agent"));
}

let avatarMoveCommandSequence = 0;

function applyAvatarMovement(
  scene: Phaser.Scene,
  zone: ZoneDef,
  movement: AvatarMovement,
) {
  if (zone.id !== "workstations") return;
  const ref = getAgentRefsMap(scene.game)[zone.id]?.[movement.studentId];
  if (!ref) return;
  if (
    typeof ref.lastRevision === "number"
    && movement.revision <= ref.lastRevision
  ) return;
  ref.lastRevision = movement.revision;

  const avatars =
    (scene.game.registry.get("agent-avatars") as AgentAvatarState[] | undefined)
    ?? [];
  scene.game.registry.set(
    "agent-avatars",
    avatars.map((avatar) =>
      avatar.studentId === movement.studentId
        ? {
            ...avatar,
            position: {
              zone: "workstations" as const,
              x: movement.targetX,
              y: movement.targetY,
              facing: movement.facing,
              revision: movement.revision,
              updatedAt: movement.updatedAt,
            },
          }
        : avatar,
    ),
  );

  const start = toCanonicalWorkstationPoint(
    { x: ref.container.x, y: ref.container.y },
    scene.scale.width,
    scene.scale.height,
  );
  const destination = { x: movement.targetX, y: movement.targetY };
  const route = findWorkstationPath(start, destination);
  let canonicalPoints = route?.points ?? [start, destination];
  if (movement.source === "system") {
    const finalPoint = canonicalPoints.at(-1);
    if (
      !finalPoint
      || Math.hypot(
        finalPoint.x - destination.x,
        finalPoint.y - destination.y,
      ) > 0.5
    ) {
      canonicalPoints = [...canonicalPoints, destination];
    }
  }
  const points = canonicalPoints
    .slice(1)
    .map((point) => fromCanonicalWorkstationPoint(
      point,
      scene.scale.width,
      scene.scale.height,
    ));

  scene.tweens.killTweensOf(ref.container);
  animatePathSegment(scene, zone, ref, points, 0, movement.facing);
}

function animatePathSegment(
  scene: Phaser.Scene,
  zone: ZoneDef,
  ref: AgentRefRecord,
  points: Array<{ x: number; y: number }>,
  index: number,
  finalFacing: CharacterFacing,
) {
  const destination = points[index];
  if (!destination) {
    ref.facing = finalFacing;
    const finalState = ref.currentStatus === "working" || ref.currentStatus === "reviewing"
      ? "seated-active"
      : "standing";
    ref.visualState = finalState;
    if (ref.sprite && ref.role) {
      ref.sprite.setFlipX(finalFacing === "right");
      applyWorkstationSpriteState(
        scene,
        ref.sprite,
        ref.role,
        finalState,
        0,
        undefined,
        finalFacing,
      );
    }
    return;
  }

  const dx = destination.x - ref.container.x;
  const dy = destination.y - ref.container.y;
  const distance = Math.hypot(dx, dy);
  if (distance < 0.5) {
    animatePathSegment(scene, zone, ref, points, index + 1, finalFacing);
    return;
  }
  const nextFacing: CharacterFacing = Math.abs(dx) >= Math.abs(dy)
    ? dx >= 0 ? "right" : "left"
    : dy >= 0 ? "down" : "up";
  ref.facing = nextFacing;
  ref.visualState = "walking";
  if (ref.sprite && ref.role) {
    ref.sprite.setFlipX(nextFacing === "right");
    applyWorkstationSpriteState(
      scene,
      ref.sprite,
      ref.role,
      "walking",
      index % 2,
      undefined,
      nextFacing,
    );
  }

  scene.tweens.add({
    targets: ref.container,
    x: destination.x,
    y: destination.y,
    duration: Math.max(70, (distance / 150) * 1000),
    ease: "Linear",
    onUpdate: () => updateMovingAgentLayering(zone, ref),
    onComplete: () => {
      updateMovingAgentLayering(zone, ref);
      animatePathSegment(scene, zone, ref, points, index + 1, finalFacing);
    },
  });
}

function updateMovingAgentLayering(zone: ZoneDef, ref: AgentRefRecord) {
  const layering = resolveActorLayering(zone.id, ref.container.y, 58);
  ref.container.setDepth(layering.actorDepth);
  ref.label.setPosition(ref.container.x, layering.labelY);
  ref.aura?.setPosition(
    ref.container.x - ref.originX,
    ref.container.y - ref.originY,
  );
  if (ref.bubble) {
    ref.bubble.label.setPosition(ref.container.x, ref.container.y - 58);
    ref.bubble.bg.setPosition(
      ref.container.x - ref.originX,
      ref.container.y - ref.originY,
    );
  }
}

function enableControlledAgentPointAndClick(
  scene: Phaser.Scene,
  zone: ZoneDef,
  controlledAgentId?: string,
) {
  if (!controlledAgentId || zone.id !== "workstations") return;

  const ref = getAgentRefsMap(scene.game)[zone.id]?.[controlledAgentId];
  if (!ref) return;

  const onPointerDown = (
    pointer: Phaser.Input.Pointer,
    currentlyOver: Phaser.GameObjects.GameObject[] = [],
  ) => {
    // NPC hit areas and in-canvas controls own their clicks. React HUD controls
    // are outside the canvas and therefore never reach this handler.
    if (currentlyOver.length > 0) return;
    const avatar = (
      (scene.game.registry.get("agent-avatars") as AgentAvatarState[] | undefined)
      ?? []
    ).find((item) => item.studentId === controlledAgentId);
    if (
      avatar?.movementLocked
      || avatar?.status === "working"
      || avatar?.status === "reviewing"
    ) return;

    const requestedTarget = toCanonicalWorkstationPoint(
      { x: pointer.worldX, y: pointer.worldY },
      scene.scale.width,
      scene.scale.height,
    );
    const start = toCanonicalWorkstationPoint(
      { x: ref.container.x, y: ref.container.y },
      scene.scale.width,
      scene.scale.height,
    );
    const route = findWorkstationPath(start, requestedTarget);
    if (!route || Math.hypot(
      route.target.x - start.x,
      route.target.y - start.y,
    ) < 2) return;

    const send = scene.game.registry.get("avatar-move-sender") as
      | AvatarMoveRequestSender
      | undefined;
    if (!send) return;
    avatarMoveCommandSequence += 1;
    send(
      {
        commandId: `avatar-move-${Date.now()}-${avatarMoveCommandSequence}`,
        targetX: route.target.x,
        targetY: route.target.y,
      },
      (ack) => {
        if (ack.accepted) {
          scene.game.registry.events.emit("avatar-movement", ack.movement);
        }
      },
    );
  };

  scene.input.on("pointerdown", onPointerDown);
  scene.events.once("shutdown", () => {
    scene.input.off("pointerdown", onPointerDown);
  });
}

/* ------------------------------------------------------------------ */
/*  Zone scene create                                                  */
/* ------------------------------------------------------------------ */

function createSceneContent(
  scene: Phaser.Scene,
  zone: ZoneDef,
) {
  const vw = scene.scale.width;
  const vh = scene.scale.height;
  const avatarData =
    (scene.game.registry.get("agent-avatars") as AgentAvatarState[] | undefined) ?? [];
  const controlledAgentId = scene.game.registry.get("controlled-agent-id") as
    | string
    | undefined;
  const runtimeZone: ZoneDef = {
    ...zone,
    agents: buildZoneAgentRoster(zone, avatarData, controlledAgentId),
  };
  const workstationsWalkGraph =
    zone.id === "workstations" ? buildWorkstationsWalkGraph(vw, vh) : undefined;
  const motionCoordinator =
    zone.id === "workstations" ? new WorkstationMotionCoordinator(2) : undefined;
  if (motionCoordinator) {
    scene.game.registry.set("__workstationMotionCoordinator__", motionCoordinator);
  }

  scene.cameras.main.setBackgroundColor(zone.bgColor);
  if (zone.id === "workstations") {
    const layout = buildWorkstationsLayout(vw, vh);
    scene.cameras.main.setZoom(layout.cameraZoom);
    scene.cameras.main.centerOn(vw / 2, vh / 2 + 20);
  }

  // Compute tilemap grid size to fill viewport
  const scale = 3;
  const mapCols = Math.ceil(vw / (TILE_SIZE * scale)) + 2;
  const mapRows = Math.ceil(vh / (TILE_SIZE * scale)) + 2;

  // -- Ground tilemap layer --
  const groundData = buildOfficeTilesForZone(mapCols, mapRows, zone, vw, vh);

  const map = scene.make.tilemap({
    data: groundData,
    tileWidth: TILE_SIZE,
    tileHeight: TILE_SIZE,
  });
  const tileset = map.addTilesetImage(
    TILESET_KEY,
    TILESET_KEY,
    TILE_SIZE,
    TILE_SIZE,
    1,
    1,
  );
  const groundLayer = map.createLayer(0, tileset!, 0, 0)!;
  groundLayer.setScale(scale);

  const usesDedicatedOfficeScene = drawDedicatedOfficeZone(scene, zone.id, vw, vh);

  // -- Decoration sprites from tileset --
  for (const dec of usesDedicatedOfficeScene ? [] : zone.decorations) {
    const sp = scene.add.sprite(
      dec.x * TILE_SIZE + TILE_SIZE / 2,
      dec.y * TILE_SIZE + TILE_SIZE / 2,
      TILESET_KEY,
      dec.frame,
    );
    sp.setScale(dec.scaleX ?? 3, dec.scaleY ?? 3);
    sp.setDepth(1);
  }

  // -- Workstations (for workstations zone) --
  if (zone.id === "workstations") {
    ensureWorkstationTextures(scene);
    drawReplicatedWorkstationsScene(scene, runtimeZone, vw, vh);
  }

  // -- Landmarks (Graphics API) --
  for (const lm of usesDedicatedOfficeScene ? [] : zone.landmarks) {
    const sx = (vw / 960) * lm.x;
    const sy = (vh / 540) * lm.y;
    const fn = LANDMARK_DRAW[lm.label];
    if (fn) {
      fn(scene, sx, sy);
    } else {
      const g = scene.add.graphics();
      g.fillStyle(hex(lm.color), 1);
      g.fillCircle(sx, sy, 36);
      g.fillStyle(0xffffff, 0.3);
      g.fillCircle(sx, sy, 24);
      strokeText(scene, sx, sy + 42, lm.label, "14px", 0.5, 0);
    }
  }

  // -- NPCs (Graphics API) --
  drawNPCs(scene, zone.npcs, vw, vh, workstationsWalkGraph);

  // -- Agents (Graphics API with ID badges and dynamic avatar states) --
  drawAgents(
    scene,
    runtimeZone.agents,
    vw,
    vh,
    runtimeZone,
    avatarData,
    workstationsWalkGraph,
    motionCoordinator,
  );
  enableControlledAgentPointAndClick(scene, runtimeZone, controlledAgentId);

  // -- Particles --
  createParticles(scene, zone, vw);

  // -- Zone title (top-left, UI layer) --
  if (!usesDedicatedOfficeScene) {
    strokeText(
      scene,
      20,
      64,
      `${zone.emoji} ${zone.label}`,
      "24px",
    );
  }

  return runtimeZone;
}

/* ------------------------------------------------------------------ */
/*  Zone scene factory                                                 */
/* ------------------------------------------------------------------ */

function createZoneScene(Phaser: PhaserModule, zoneDef: ZoneDef) {
  return class ZoneScene extends Phaser.Scene {
    constructor() {
      super({ key: zoneDef.id, active: false });
    }

    preload() {
      // Load spritesheet only once (Phaser caches by key)
      if (!this.textures.exists(TILESET_KEY)) {
        this.load.spritesheet(TILESET_KEY, TILESET_URL, {
          frameWidth: TILE_SIZE,
          frameHeight: TILE_SIZE,
          margin: 1,
          spacing: 1,
        });
      }
      for (const { key, url } of buildWorkstationPreloadEntries()) {
        if (zoneDef.id === "workstations" || url.includes("/characters/")) {
          if (!this.textures.exists(key)) this.load.image(key, url);
        }
      }
    }

    create() {
      const runtimeZone = createSceneContent(this, zoneDef);

      // Listen for real-time agent status updates from the WebSocket layer.
      // Incrementally update only the changed agent's visuals (no scene restart).
      const game = this.game;
      const sceneKey = zoneDef.id;
      const onAgentStateChanged = (
        payload: { studentId: string; status: string; zone?: string },
      ) => {
        // Update the avatar registry so the next render reflects the change
        const current =
          (game.registry.get("agent-avatars") as AgentAvatarState[] | undefined) ??
          [];
        const updated = current.map((a) =>
          a.studentId === payload.studentId
            ? { ...a, status: payload.status as AvatarStatus }
            : a,
        );
        game.registry.set("agent-avatars", updated);

        // Incremental update: only update the specific agent's visuals
        if (game.scene.isActive(sceneKey) && payload.studentId === "__refresh__") {
          this.scene.restart();
          return;
        }
        if (game.scene.isActive(sceneKey)) {
          updateAgentVisuals(
            game.scene.getScene(sceneKey) as Phaser.Scene,
            payload.studentId,
            payload.status as AvatarStatus,
            runtimeZone,
          );
        }
      };

      game.registry.events.on("agent-state-changed", onAgentStateChanged);
      const onAvatarMovement = (payload: AvatarMovement) => {
        if (!game.scene.isActive(sceneKey)) return;
        const controlledAgentId = game.registry.get("controlled-agent-id");
        if (payload.studentId !== controlledAgentId) return;
        applyAvatarMovement(this, runtimeZone, payload);
      };
      game.registry.events.on("avatar-movement", onAvatarMovement);

      let viewport = { width: this.scale.width, height: this.scale.height };
      let resizeTimer: ReturnType<typeof setTimeout> | undefined;
      const onResize = (gameSize: { width: number; height: number }) => {
        const nextViewport = { width: gameSize.width, height: gameSize.height };
        if (!shouldRebuildSceneForResize(viewport, nextViewport)) return;
        viewport = nextViewport;
        if (resizeTimer) clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
          if (this.scene.isActive()) this.scene.restart();
        }, 120);
      };
      this.scale.on("resize", onResize);

      // Clean up listener when scene shuts down
      this.events.once("shutdown", () => {
        if (resizeTimer) clearTimeout(resizeTimer);
        this.scale.off("resize", onResize);
        game.registry.events.off("agent-state-changed", onAgentStateChanged);
        game.registry.events.off("avatar-movement", onAvatarMovement);
      });
    }
  };
}

/* ------------------------------------------------------------------ */
/*  Game bootstrap                                                     */
/* ------------------------------------------------------------------ */

export async function createWorldGame(
  parent: HTMLElement | string,
  initialZone?: string,
): Promise<DestroyableGame> {
  const phaserModule = await import("phaser");
  const Phaser = (
    "default" in phaserModule ? phaserModule.default : phaserModule
  ) as PhaserModule;

  const scenes = ZONE_DEFS.map((zoneDef) => createZoneScene(Phaser, zoneDef));
  const activeKey = initialZone ?? ZONE_DEFS[0].id;

  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    backgroundColor: ZONE_DEFS[0].bgColor,
    pixelArt: true,
    antialias: false,
    scene: scenes,
    callbacks: {
      postBoot: buildWorldPostBoot(activeKey),
    },
    scale: {
      mode: Phaser.Scale.RESIZE,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      width: "100%",
      height: "100%",
    },
  });

  return game;
}
