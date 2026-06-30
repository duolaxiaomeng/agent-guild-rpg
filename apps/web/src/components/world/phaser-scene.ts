import { T, ZONE_DEFS, type ZoneDef, type AgentDef } from "./zone-config";

export const PIXEL_WORLD_MOUNT_ID = "pixel-world";

export const ZONE_SCENE_KEYS: Record<string, string> = Object.fromEntries(
  ZONE_DEFS.map((z) => [z.id, z.id]),
);

type PhaserModule = typeof import("phaser");

export type ScenePlugin = {
  start: (key: string) => void;
  stop: (key: string) => void;
  isActive: (key: string) => boolean;
};

export type DestroyableGame = {
  destroy: (removeCanvas: boolean, noReturn?: boolean) => void;
  scene: ScenePlugin;
};

/* ------------------------------------------------------------------ */
/*  Tileset constants                                                  */
/* ------------------------------------------------------------------ */

const TILE_SIZE = 16;
const TILESET_KEY = "roguelike-tiles";
const TILESET_URL =
  "/assets/kenney/roguelike-rpg-pack/Spritesheet/roguelikeSheet_transparent.png";

export type WorkstationsLayout = {
  wallBand: { x: number; y: number; width: number; height: number };
  doubleDeskAnchors: Array<{ x: number; y: number }>;
  multiScreenDesk: { x: number; y: number };
  focusDesk: { x: number; y: number };
  loungeRect: { x: number; y: number; width: number; height: number };
  walkerAnchors: Array<{ x: number; y: number }>;
};

export function buildWorkstationsLayout(vw: number, _vh: number): WorkstationsLayout {
  return {
    wallBand: { x: Math.round(vw * 0.067), y: 44, width: Math.round(vw * 0.867), height: 70 },
    doubleDeskAnchors: [
      { x: 160, y: 214 },
      { x: 292, y: 214 },
      { x: 160, y: 292 },
      { x: 292, y: 292 },
    ],
    multiScreenDesk: { x: 160, y: 392 },
    focusDesk: { x: 470, y: 394 },
    loungeRect: { x: 610, y: 286, width: 246, height: 184 },
    walkerAnchors: [
      { x: 756, y: 176 },
      { x: 822, y: 196 },
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
    fontFamily: '"Press Start 2P", monospace',
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
    fontSize: "11px",
    fontFamily: '"Press Start 2P", monospace',
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

  // Coffee steam for lobby
  if (zone.id === "lobby" && zone.landmarks.length > 1) {
    const coffee = zone.landmarks[1];
    scene.add.particles(coffee.x, coffee.y - 20, "p-spark", {
      speed: { min: 8, max: 20 },
      angle: { min: 260, max: 280 },
      lifespan: 1200,
      frequency: 300,
      scale: { start: 1.2, end: 0 },
      alpha: { start: 0.5, end: 0 },
    });
  }
}

/* ------------------------------------------------------------------ */
/*  NPC rendering (office characters)                                  */
/* ------------------------------------------------------------------ */

function drawNPCs(
  s: Phaser.Scene,
  npcs: ZoneDef["npcs"],
  vw: number,
  vh: number,
) {
  const sx = vw / 960;
  const sy = vh / 540;

  for (const npc of npcs) {
    const x = npc.x * sx;
    const y = npc.y * sy;
    const nc = hex(npc.color);
    const g = s.add.graphics();

    // Shadow
    g.fillStyle(0x000000, 0.15);
    g.fillEllipse(x, y + 12, 18, 6);

    // Legs (dark pants)
    g.fillStyle(0x1e293b, 1);
    g.fillRect(x - 5, y, 4, 10);
    g.fillRect(x + 1, y, 4, 10);

    // Body (shirt)
    g.fillStyle(nc, 1);
    g.fillRect(x - 6, y - 12, 12, 14);

    // Head
    g.fillStyle(0xfde68a, 1);
    g.fillCircle(x, y - 18, 7);

    // Hair
    g.fillStyle(0x78350f, 1);
    g.fillCircle(x, y - 22, 6);
    g.fillRect(x - 7, y - 22, 14, 3);

    // Eyes
    g.fillStyle(0x1e293b, 1);
    g.fillCircle(x - 3, y - 18, 1);
    g.fillCircle(x + 3, y - 18, 1);

    // Name label
    strokeText(s, x, y - 34, npc.name, "11px", 0.5, 1);

    // Tooltip
    tooltipBox(s, x - 30, y + 16, npc.tooltip);

    // Idle bobbing
    s.tweens.add({
      targets: g,
      y: -3,
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

function drawAgents(
  s: Phaser.Scene,
  agents: AgentDef[],
  vw: number,
  vh: number,
) {
  const sx = vw / 960;
  const sy = vh / 540;

  for (const agent of agents) {
    const x = agent.x * sx;
    const y = agent.y * sy;
    const shirtC = hex(agent.shirtColor);
    const hairC = hex(agent.hairColor);
    const g = s.add.graphics();

    // Shadow
    g.fillStyle(0x000000, 0.15);
    g.fillEllipse(x, y + 12, 18, 6);

    if (agent.seated) {
      // Chair (black office chair)
      g.fillStyle(0x1e293b, 1);
      g.fillEllipse(x, y + 8, 20, 10);
      g.fillStyle(0x334155, 1);
      g.fillEllipse(x, y + 6, 16, 8);

      // Legs (seated, shorter)
      g.fillStyle(0x1e293b, 1);
      g.fillRect(x - 5, y - 2, 4, 8);
      g.fillRect(x + 1, y - 2, 4, 8);

      // Body
      g.fillStyle(shirtC, 1);
      g.fillRect(x - 6, y - 14, 12, 14);

      // Head
      g.fillStyle(0xfde68a, 1);
      g.fillCircle(x, y - 20, 7);

      // Hair
      g.fillStyle(hairC, 1);
      g.fillCircle(x, y - 24, 6);
      g.fillRect(x - 7, y - 24, 14, 3);

      // Eyes (looking at screen)
      g.fillStyle(0x1e293b, 1);
      g.fillCircle(x - 3, y - 20, 1);
      g.fillCircle(x + 3, y - 20, 1);

      // Arms on desk
      g.fillStyle(0xfde68a, 1);
      g.fillRect(x - 10, y - 10, 4, 6);
      g.fillRect(x + 6, y - 10, 4, 6);
    } else {
      // Standing agent
      g.fillStyle(0x1e293b, 1);
      g.fillRect(x - 5, y, 4, 10);
      g.fillRect(x + 1, y, 4, 10);

      g.fillStyle(shirtC, 1);
      g.fillRect(x - 6, y - 12, 12, 14);

      g.fillStyle(0xfde68a, 1);
      g.fillCircle(x, y - 18, 7);

      g.fillStyle(hairC, 1);
      g.fillCircle(x, y - 22, 6);
      g.fillRect(x - 7, y - 22, 14, 3);

      g.fillStyle(0x1e293b, 1);
      g.fillCircle(x - 3, y - 18, 1);
      g.fillCircle(x + 3, y - 18, 1);
    }

    // Blue circular ID badge
    const badgeX = x + 16;
    const badgeY = y - 28;
    g.fillStyle(0x3b82f6, 1);
    g.fillCircle(badgeX, badgeY, 8);
    g.fillStyle(0xffffff, 1);
    // Draw badge number as text
    const numText = s.add.text(badgeX, badgeY, String(agent.badgeNum), {
      color: "#fff",
      fontSize: "9px",
      fontFamily: '"Press Start 2P", monospace',
    });
    numText.setOrigin(0.5, 0.5);

    // Status icon (floating above badge)
    if (agent.statusIcon) {
      drawStatusIcon(s, g, x - 16, y - 32, agent.statusIcon);
    }

    // Label
    strokeText(s, x, y - 40, agent.label, "10px", 0.5, 1);

    // Tooltip
    tooltipBox(s, x - 40, y + 20, agent.tooltip);

    // Idle bobbing
    s.tweens.add({
      targets: g,
      y: -2,
      duration: 1000,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });
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
/*  Workstation rendering                                              */
/* ------------------------------------------------------------------ */

function drawWorkstation(
  s: Phaser.Scene,
  cx: number,
  cy: number,
  agent?: AgentDef,
) {
  const g = s.add.graphics();

  // Desk (brown)
  g.fillStyle(0x92400e, 1);
  g.fillRect(cx - 40, cy - 8, 80, 32);
  g.fillStyle(0xb45309, 1);
  g.fillRect(cx - 40, cy - 8, 80, 4);

  // Desk legs
  g.fillStyle(0x78350f, 1);
  g.fillRect(cx - 36, cy + 24, 6, 12);
  g.fillRect(cx + 30, cy + 24, 6, 12);

  // Monitor(s)
  const monitorCount = agent ? 2 : 1;
  for (let i = 0; i < monitorCount; i++) {
    const mx = cx - 20 + i * 28;
    // Monitor stand
    g.fillStyle(0x1e293b, 1);
    g.fillRect(mx + 8, cy - 4, 4, 6);
    // Monitor base
    g.fillRect(mx + 4, cy + 2, 12, 2);
    // Monitor screen
    g.fillStyle(0x0f172a, 1);
    g.fillRect(mx, cy - 20, 20, 16);
    // Screen content (blue glow)
    g.fillStyle(0x3b82f6, 0.7);
    g.fillRect(mx + 2, cy - 18, 16, 12);
    // Screen details
    g.fillStyle(0x60a5fa, 0.5);
    g.fillRect(mx + 4, cy - 16, 12, 2);
    g.fillRect(mx + 4, cy - 12, 8, 2);
  }

  // Keyboard
  g.fillStyle(0x1e293b, 1);
  g.fillRect(cx - 12, cy + 4, 24, 6);
  g.fillStyle(0x334155, 1);
  for (let kx = 0; kx < 6; kx++) {
    g.fillRect(cx - 10 + kx * 4, cy + 5, 3, 2);
  }

  // Mouse
  g.fillStyle(0x1e293b, 1);
  g.fillEllipse(cx + 24, cy + 6, 4, 6);

  // Coffee mug
  g.fillStyle(0xf8fafc, 1);
  g.fillRect(cx - 32, cy + 2, 6, 8);
  g.fillStyle(0x78350f, 1);
  g.fillRect(cx - 31, cy + 3, 4, 2);

  // Papers
  g.fillStyle(0xf8fafc, 1);
  g.fillRect(cx + 28, cy + 2, 8, 10);
  g.fillStyle(0x94a3b8, 0.5);
  g.fillRect(cx + 30, cy + 4, 4, 1);
  g.fillRect(cx + 30, cy + 6, 6, 1);
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

function drawLoungeSofa(s: Phaser.Scene, cx: number, cy: number) {
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
  strokeText(s, cx, cy + 30, label, "10px", 0.5, 0);
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
    fontFamily: '"Press Start 2P", monospace',
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
  strokeText(s, cx, cy + 32, "公告板", "12px", 0.5, 0);
}

function drawCoffeeStation(s: Phaser.Scene, cx: number, cy: number) {
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
  strokeText(s, cx, cy + 28, "咖啡角", "12px", 0.5, 0);
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
  strokeText(s, cx, cy + 38, "状态面板", "12px", 0.5, 0);
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
  strokeText(s, cx, cy + 40, "协作白板", "12px", 0.5, 0);
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
  strokeText(s, cx, cy + 36, "圆桌会议", "12px", 0.5, 0);
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
  strokeText(s, cx, cy + 40, "任务看板", "12px", 0.5, 0);
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
  strokeText(s, cx, cy + 42, "评审工作台", "12px", 0.5, 0);
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

  drawWallBand(scene, layout.wallBand.x, layout.wallBand.y, layout.wallBand.width, layout.wallBand.height);
  drawWallFrame(scene, 112 * sx, 76 * sy, 0xf59e0b);
  drawWallFrame(scene, 156 * sx, 76 * sy, 0xef4444);
  drawOfficeDisplay(scene, 316 * sx, 76 * sy, "看板");
  drawPottedPlant(scene, 536 * sx, 82 * sy);
  drawBookshelf(scene, 592 * sx, 82 * sy);
  drawOfficeDisplay(scene, 688 * sx, 76 * sy, "报表");
  drawPixelSign(scene, 796 * sx, 78 * sy, "PIXEL");

  drawPottedPlant(scene, 620 * sx, 348 * sy);
  drawWaterCooler(scene, 664 * sx, 352 * sy);
  drawCoffeeStation(scene, 732 * sx, 348 * sy);
  drawStorageCabinet(scene, 816 * sx, 350 * sy);
  drawPottedPlant(scene, 892 * sx, 352 * sy);
  drawLoungeSofa(scene, 784 * sx, 434 * sy);

  layout.doubleDeskAnchors.forEach((anchor, index) => {
    drawWorkstation(scene, anchor.x * sx, anchor.y * sy, seatedAgents[index]);
  });
  drawWorkstation(scene, layout.multiScreenDesk.x * sx, layout.multiScreenDesk.y * sy, seatedAgents[2]);
  drawWorkstation(scene, layout.focusDesk.x * sx, layout.focusDesk.y * sy, seatedAgents[3]);
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

  scene.cameras.main.setBackgroundColor(zone.bgColor);

  // Compute tilemap grid size to fill viewport
  const scale = Math.max(Math.ceil(vw / (45 * TILE_SIZE)), 2);
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

  // -- Decoration sprites from tileset --
  for (const dec of zone.decorations) {
    const sp = scene.add.sprite(
      dec.x * TILE_SIZE + TILE_SIZE / 2,
      dec.y * TILE_SIZE + TILE_SIZE / 2,
      TILESET_KEY,
      dec.frame,
    );
    sp.setScale(dec.scaleX ?? 2, dec.scaleY ?? 2);
    sp.setDepth(1);
  }

  // -- Workstations (for workstations zone) --
  if (zone.id === "workstations") {
    drawReplicatedWorkstationsScene(scene, zone, vw, vh);
  }

  // -- Landmarks (Graphics API) --
  for (const lm of zone.landmarks) {
    const sx = (vw / 960) * lm.x;
    const sy = (vh / 540) * lm.y;
    const fn = LANDMARK_DRAW[lm.label];
    if (fn) {
      fn(scene, sx, sy);
    } else {
      const g = scene.add.graphics();
      g.fillStyle(hex(lm.color), 1);
      g.fillCircle(sx, sy, 24);
      g.fillStyle(0xffffff, 0.3);
      g.fillCircle(sx, sy, 16);
      strokeText(scene, sx, sy + 30, lm.label, "12px", 0.5, 0);
    }
  }

  // -- NPCs (Graphics API) --
  drawNPCs(scene, zone.npcs, vw, vh);

  // -- Agents (Graphics API with ID badges) --
  drawAgents(scene, zone.agents, vw, vh);

  // -- Particles --
  createParticles(scene, zone, vw);

  // -- Zone title (top-left, UI layer) --
  strokeText(
    scene,
    20,
    64,
    `${zone.emoji} ${zone.label}`,
    "20px",
  );
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
    }

    create() {
      createSceneContent(this, zoneDef);
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
    scene: scenes,
    scale: {
      mode: Phaser.Scale.RESIZE,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      width: "100%",
      height: "100%",
    },
  });

  game.scene.start(activeKey);

  return game;
}
