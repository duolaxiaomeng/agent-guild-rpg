import type { OfficeOutfit } from "./zone-config";
import type { WorkstationVisualState } from "./workstation-motion";

export type WorkstationRole =
  | "browser"
  | "coder"
  | "files"
  | "ops"
  | "lead"
  | "staff"
  | "visitor";

export type DeskRole = Exclude<WorkstationRole, "staff" | "visitor">;

export const WORKSTATION_DEPTHS = {
  room: 0,
  rear: 3,
  actor: 4,
  front: 5,
  labels: 6,
} as const;

export type WorkstationModelSpec = {
  rearKey: string;
  rearUrl: string;
  frontKey: string;
  frontUrl: string;
  width: number;
  height: number;
  characterHeight: number;
  seatAnchor: { x: number; y: number };
  floorAnchor: { x: number; y: number };
  screenAnchors: Array<{ x: number; y: number }>;
  props: string[];
};

function modelSpec(
  role: DeskRole,
  props: string[],
  screenAnchors: Array<{ x: number; y: number }>,
  width = 126,
  height = 108,
  seatX = 0.68,
): WorkstationModelSpec {
  const root = "/world/workstations/models";
  return {
    rearKey: `workstation-${role}-rear`,
    rearUrl: `${root}/${role}-empty.png`,
    frontKey: `workstation-${role}-front`,
    frontUrl: `${root}/${role}-front.png`,
    width,
    height,
    characterHeight: 72,
    seatAnchor: { x: seatX, y: 0.72 },
    floorAnchor: { x: 0.5, y: 0.94 },
    screenAnchors,
    props,
  };
}

export function buildWorkstationModelManifest(): Record<DeskRole, WorkstationModelSpec> {
  return {
    browser: modelSpec("browser", ["dual-browser", "coffee", "notes"], [{ x: 0.28, y: 0.2 }, { x: 0.5, y: 0.2 }], 132),
    coder: modelSpec("coder", ["code-screen", "keyboard", "terminal"], [{ x: 0.31, y: 0.2 }, { x: 0.54, y: 0.25 }], 132),
    files: modelSpec("files", ["file-rack", "documents", "folder"], [{ x: 0.31, y: 0.21 }], 132),
    ops: modelSpec("ops", ["alert-screen", "status-light", "toolbox"], [{ x: 0.3, y: 0.2 }, { x: 0.54, y: 0.24 }], 132),
    lead: modelSpec("lead", ["dual-screen", "task-docs", "comms"], [{ x: 0.26, y: 0.2 }, { x: 0.64, y: 0.2 }], 170, 114, 0.62),
  };
}

export function resolveWorkstationPlacement(
  model: WorkstationModelSpec,
  viewportWidth: number,
  viewportHeight: number,
) {
  const scale = Math.min(viewportWidth / 960, viewportHeight / 540);
  const characterHeight = Math.round(model.characterHeight * scale);
  const seatedSpriteY = Math.round(model.characterHeight * 0.3);
  const characterFootOffset = (seatedSpriteY + model.characterHeight * 0.08) * scale;
  const deskHeight = Math.round(model.height * scale);
  return {
    scale,
    deskWidth: Math.round(model.width * scale),
    deskHeight,
    characterHeight,
    seatX: model.seatAnchor.x,
    seatY: model.seatAnchor.y,
    seatedSpriteX: Math.round(model.width * (model.seatAnchor.x - 0.5)),
    seatedSpriteY,
    deskOffsetY: Math.round(
      characterFootOffset + deskHeight * (model.floorAnchor.y - model.seatAnchor.y),
    ),
  };
}

export type WorkstationCharacterSpec = {
  seatedKey?: string;
  seatedUrl?: string;
  standingKey: string;
  standingUrl: string;
  walkKeys: [string, string];
  walkUrls: [string, string];
};

function characterSpec(role: WorkstationRole): WorkstationCharacterSpec {
  const root = "/world/workstations/characters";
  const hasDesk = role !== "staff" && role !== "visitor";
  return {
    ...(hasDesk
      ? {
          seatedKey: `${role}-seated`,
          seatedUrl: `${root}/${role}-seated.png`,
        }
      : {}),
    standingKey: `${role}-standing`,
    standingUrl: `${root}/${role}-standing.png`,
    walkKeys: [`${role}-walk-a`, `${role}-walk-b`],
    walkUrls: [`${root}/${role}-walk-a.png`, `${root}/${role}-walk-b.png`],
  };
}

export function buildWorkstationCharacterManifest(): Record<WorkstationRole, WorkstationCharacterSpec> {
  return {
    browser: characterSpec("browser"),
    coder: characterSpec("coder"),
    files: characterSpec("files"),
    ops: characterSpec("ops"),
    lead: characterSpec("lead"),
    staff: characterSpec("staff"),
    visitor: characterSpec("visitor"),
  };
}

export function buildWorkstationPreloadEntries(): Array<{ key: string; url: string }> {
  const entries: Array<{ key: string; url: string }> = [];
  for (const model of Object.values(buildWorkstationModelManifest())) {
    entries.push({ key: model.rearKey, url: model.rearUrl });
    entries.push({ key: model.frontKey, url: model.frontUrl });
  }
  for (const character of Object.values(buildWorkstationCharacterManifest())) {
    if (character.seatedKey && character.seatedUrl) {
      entries.push({ key: character.seatedKey, url: character.seatedUrl });
    }
    entries.push({ key: character.standingKey, url: character.standingUrl });
    entries.push({ key: character.walkKeys[0], url: character.walkUrls[0] });
    entries.push({ key: character.walkKeys[1], url: character.walkUrls[1] });
  }
  return entries;
}

export function resolveWorkstationCharacterKey(
  role: WorkstationRole,
  state: WorkstationVisualState,
  walkFrame = 0,
): string {
  const character = buildWorkstationCharacterManifest()[role];
  if (state === "walking") return character.walkKeys[walkFrame % 2 === 0 ? 0 : 1];
  if (state === "seated-idle" || state === "seated-active") {
    return character.seatedKey ?? character.standingKey;
  }
  return character.standingKey;
}

export function resolveSeatedDeskScale(scale: number): number {
  return Math.abs(scale);
}

const OUTFIT_ROLE: Record<OfficeOutfit, WorkstationRole> = {
  "blue-shirt": "browser",
  "green-jacket": "coder",
  "purple-shirt": "files",
  "orange-jacket": "ops",
  "navy-lead": "lead",
  "teal-staff": "staff",
  "gray-visitor": "visitor",
};

export function workstationRoleFromOutfit(outfit: OfficeOutfit | undefined): WorkstationRole {
  return outfit ? OUTFIT_ROLE[outfit] : "browser";
}
