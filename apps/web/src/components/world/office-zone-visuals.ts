import { buildCollabRoomLayout } from "./collab-room-layout";
import { buildLobbyLayout } from "./lobby-layout";
import { buildReviewStationLayout } from "./review-station-layout";

type Scene = import("phaser").Scene;
type Container = import("phaser").GameObjects.Container;
type Graphics = import("phaser").GameObjects.Graphics;

export const OFFICE_ZONE_DEPTHS = {
  wall: 10,
  floor: 20,
  fixtures: 40,
  effects: 900,
  labels: 1000,
} as const;

export function officeFootDepth(footY: number): number {
  return 100 + Math.round(footY);
}

export function formatLobbyClock(now = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
}

export function buildOfficeZoneVisualManifest() {
  return {
    lobby: [
      "studio-header",
      "reception-desk",
      "waiting-sofa",
      "announcement-wall",
      "portal-workstations",
      "portal-collab",
      "portal-review",
    ],
    "collab-room": [
      "collaboration-board",
      "round-table-back",
      "round-table-front",
      "six-seats",
      "materials-cabinet",
      "consensus-display",
    ],
    "review-station": [
      "review-status-screen",
      "decision-desk-back",
      "decision-desk-front",
      "waiting-benches",
      "quality-console",
      "presentation-spot",
    ],
    showRouteOverlay: false,
    showRouteLegends: false,
  } as const;
}

function layer(scene: Scene, depth: number, sx: number, sy: number): Container {
  const container = scene.add.container(0, 0);
  container.setScale(sx, sy);
  container.setDepth(depth);
  return container;
}

function graphics(scene: Scene, parent: Container): Graphics {
  const value = scene.add.graphics();
  parent.add(value);
  return value;
}

function text(
  scene: Scene,
  parent: Container,
  x: number,
  y: number,
  value: string,
  size = 12,
  color = "#f8fafc",
) {
  const label = scene.add.text(x, y, value, {
    color,
    fontSize: `${size}px`,
    fontFamily: "monospace",
    fontStyle: "bold",
    stroke: "#0f172a",
    strokeThickness: 2,
  });
  label.setOrigin(0.5, 0.5);
  parent.add(label);
  return label;
}

function drawRoomShell(scene: Scene, sx: number, sy: number, wallColor: number, trimColor: number) {
  const base = layer(scene, OFFICE_ZONE_DEPTHS.wall, sx, sy);
  const g = graphics(scene, base);
  g.fillStyle(0x111827, 0.34);
  g.fillRoundedRect(16, 22, 928, 500, 14);
  g.fillStyle(wallColor, 1);
  g.fillRoundedRect(22, 28, 916, 486, 10);
  g.fillStyle(0xe2e8f0, 1);
  g.fillRect(34, 136, 892, 366);
  g.fillStyle(trimColor, 1);
  g.fillRect(34, 124, 892, 12);
  g.fillRect(34, 498, 892, 6);
  g.lineStyle(2, 0x0f172a, 0.34);
  g.strokeRoundedRect(22, 28, 916, 486, 10);
  for (let x = 46; x < 920; x += 48) {
    g.lineBetween(x, 136, x, 498);
  }
  for (let y = 136; y < 498; y += 48) {
    g.lineBetween(34, y, 926, y);
  }
}

function drawPlant(scene: Scene, parent: Container, x: number, y: number) {
  const g = graphics(scene, parent);
  g.fillStyle(0x713f12, 1);
  g.fillRect(x - 14, y - 20, 28, 20);
  g.fillStyle(0x92400e, 1);
  g.fillRect(x - 11, y - 18, 22, 14);
  g.fillStyle(0x166534, 1);
  g.fillEllipse(x, y - 32, 34, 28);
  g.fillStyle(0x22c55e, 1);
  g.fillEllipse(x - 8, y - 42, 14, 30);
  g.fillEllipse(x + 8, y - 42, 14, 30);
  g.fillEllipse(x, y - 52, 12, 34);
}

function drawLobby(scene: Scene, sx: number, sy: number) {
  const layout = buildLobbyLayout(960, 540);
  drawRoomShell(scene, sx, sy, 0xd6c3ad, 0x475569);

  const wall = layer(scene, OFFICE_ZONE_DEPTHS.fixtures, sx, sy);
  const wg = graphics(scene, wall);
  const wallTop = layout.hudSafeAreas.top + 4;
  wg.fillStyle(0x172033, 1);
  wg.fillRoundedRect(76, wallTop, 250, 56, 4);
  wg.fillStyle(0x334155, 1);
  wg.fillRect(84, wallTop + 8, 234, 40);
  text(scene, wall, 201, wallTop + 22, "AGENT STUDIO", 18, "#f8fafc");
  text(scene, wall, 201, wallTop + 41, "TEACHING OPERATIONS", 8, "#93c5fd");

  const cards = [
    { x: 354, title: "TODAY", value: "DAY 03", color: 0x38bdf8 },
    { x: 502, title: "ONLINE", value: "12 AGENTS", color: 0x22c55e },
    {
      x: 650,
      title: "LOCAL TIME",
      value: formatLobbyClock(),
      color: 0xf59e0b,
      realtime: true,
    },
  ];
  for (const card of cards) {
    wg.fillStyle(0x1e293b, 1);
    wg.fillRoundedRect(card.x, wallTop, 132, 56, 4);
    wg.fillStyle(card.color, 1);
    wg.fillRect(card.x + 8, wallTop + 8, 4, 40);
    text(scene, wall, card.x + 70, wallTop + 18, card.title, 9, "#94a3b8");
    const valueLabel = text(scene, wall, card.x + 70, wallTop + 37, card.value, 11);
    if (card.realtime) {
      scene.time.addEvent({
        delay: 1000,
        loop: true,
        callback: () => valueLabel.setText(formatLobbyClock()),
      });
    }
  }

  const floor = layer(scene, OFFICE_ZONE_DEPTHS.floor + 1, sx, sy);
  const fg = graphics(scene, floor);
  fg.fillStyle(0x9a6b3d, 0.42);
  fg.fillRoundedRect(330, 266, 300, 154, 18);
  fg.lineStyle(3, 0x6b4423, 0.5);
  fg.strokeRoundedRect(338, 274, 284, 138, 14);
  fg.fillStyle(0x334155, 0.18);
  fg.fillCircle(480, 344, 52);
  fg.lineStyle(5, 0xf8fafc, 0.2);
  fg.lineBetween(446, 326, 514, 362);
  fg.lineBetween(514, 326, 446, 362);

  const waiting = layer(scene, officeFootDepth(350), sx, sy);
  const lg = graphics(scene, waiting);
  const waitingRect = layout.zones.waiting;
  lg.fillStyle(0x7c5c42, 0.35);
  lg.fillRoundedRect(waitingRect.x, waitingRect.y, waitingRect.width, waitingRect.height, 8);
  lg.fillStyle(0x374151, 1);
  lg.fillRoundedRect(76, 206, 212, 86, 10);
  lg.fillStyle(0x64748b, 1);
  lg.fillRoundedRect(84, 190, 196, 62, 10);
  lg.fillStyle(0x94a3b8, 1);
  lg.fillRect(94, 204, 82, 38);
  lg.fillRect(188, 204, 82, 38);
  lg.fillStyle(0x6b3f1f, 1);
  lg.fillRoundedRect(118, 304, 128, 42, 5);
  lg.fillStyle(0xa16207, 1);
  lg.fillRect(126, 304, 112, 8);
  lg.fillStyle(0xf8fafc, 1);
  lg.fillRect(148, 314, 34, 20);
  lg.fillStyle(0x38bdf8, 1);
  lg.fillRect(196, 316, 22, 16);
  text(scene, waiting, 183, 368, "WAITING LOUNGE", 10, "#334155");
  drawPlant(scene, waiting, 76, 374);
  drawPlant(scene, waiting, 288, 374);

  const receptionRect = layout.zones.reception;
  const receptionBack = layer(scene, officeFootDepth(170), sx, sy);
  const rb = graphics(scene, receptionBack);
  rb.fillStyle(0x1e293b, 1);
  rb.fillRect(receptionRect.x + 44, receptionRect.y, 76, 42);
  rb.fillRect(receptionRect.x + 156, receptionRect.y, 76, 42);
  rb.fillStyle(0x38bdf8, 0.9);
  rb.fillRect(receptionRect.x + 50, receptionRect.y + 6, 64, 30);
  rb.fillStyle(0x22c55e, 0.9);
  rb.fillRect(receptionRect.x + 162, receptionRect.y + 6, 64, 30);

  const reception = layer(scene, officeFootDepth(receptionRect.y + receptionRect.height - 6), sx, sy);
  const rg = graphics(scene, reception);
  rg.fillStyle(0x4b2d19, 1);
  rg.fillRoundedRect(receptionRect.x + 8, receptionRect.y + 34, receptionRect.width - 16, 86, 5);
  rg.fillStyle(0x8b4a20, 1);
  rg.fillRect(receptionRect.x + 18, receptionRect.y + 42, receptionRect.width - 36, 68);
  rg.fillStyle(0xb66a2c, 1);
  rg.fillRect(receptionRect.x, receptionRect.y + 30, receptionRect.width, 14);
  rg.fillStyle(0xe2e8f0, 1);
  rg.fillRect(receptionRect.x + 72, receptionRect.y + 50, 132, 8);
  rg.fillStyle(0xf59e0b, 1);
  rg.fillCircle(receptionRect.x + receptionRect.width / 2, receptionRect.y + 82, 18);
  text(scene, reception, receptionRect.x + receptionRect.width / 2, receptionRect.y + 82, "A", 15, "#111827");
  text(scene, reception, receptionRect.x + receptionRect.width / 2, receptionRect.y + 106, "WELCOME DESK", 10);

  const portals = layer(scene, officeFootDepth(390), sx, sy);
  const pg = graphics(scene, portals);
  const portalRect = layout.zones.wayfinding;
  pg.fillStyle(0x172033, 1);
  pg.fillRoundedRect(portalRect.x, portalRect.y, portalRect.width, portalRect.height, 8);
  text(scene, portals, portalRect.x + portalRect.width / 2, portalRect.y + 19, "STUDIO DIRECTORY", 12);
  const entries = [
    { y: 198, label: "WORKSTATIONS", color: 0x38bdf8 },
    { y: 258, label: "COLLAB ROOM", color: 0xf59e0b },
    { y: 318, label: "REVIEW STATION", color: 0x22c55e },
  ];
  for (const entry of entries) {
    pg.fillStyle(0x334155, 1);
    pg.fillRoundedRect(678, entry.y, 210, 46, 4);
    pg.fillStyle(entry.color, 1);
    pg.fillRect(686, entry.y + 8, 6, 30);
    pg.fillStyle(0x0f172a, 1);
    pg.fillRect(704, entry.y + 8, 32, 30);
    pg.fillStyle(entry.color, 0.75);
    pg.fillRect(710, entry.y + 14, 20, 18);
    text(scene, portals, 810, entry.y + 23, entry.label, 10);
  }
  drawPlant(scene, portals, 676, 410);
  drawPlant(scene, portals, 890, 410);

}

function drawChair(scene: Scene, parent: Container, x: number, y: number, color: number) {
  const g = graphics(scene, parent);
  g.fillStyle(0x1f2937, 1);
  g.fillRoundedRect(x - 22, y - 20, 44, 38, 8);
  g.fillStyle(color, 1);
  g.fillRoundedRect(x - 17, y - 16, 34, 26, 6);
  g.fillStyle(0x111827, 1);
  g.fillRect(x - 3, y + 16, 6, 14);
  g.fillRect(x - 16, y + 27, 32, 4);
}

function drawCollabRoom(scene: Scene, sx: number, sy: number) {
  const layout = buildCollabRoomLayout(960, 540);
  drawRoomShell(scene, sx, sy, 0xd9c5a6, 0x7c4a24);

  const wall = layer(scene, OFFICE_ZONE_DEPTHS.fixtures, sx, sy);
  const wg = graphics(scene, wall);
  wg.fillStyle(0x334155, 1);
  wg.fillRoundedRect(layout.whiteboardRect.x - 8, layout.whiteboardRect.y - 8, layout.whiteboardRect.width + 16, layout.whiteboardRect.height + 16, 5);
  wg.fillStyle(0xf8fafc, 1);
  wg.fillRect(layout.whiteboardRect.x, layout.whiteboardRect.y, layout.whiteboardRect.width, layout.whiteboardRect.height);
  text(scene, wall, 480, layout.whiteboardRect.y + 14, "SPRINT COLLABORATION", 13, "#1e293b");
  const columns = [0x38bdf8, 0xf59e0b, 0x22c55e];
  for (let col = 0; col < 3; col += 1) {
    for (let row = 0; row < 2; row += 1) {
      wg.fillStyle(columns[col], 0.88);
      wg.fillRoundedRect(326 + col * 102, layout.whiteboardRect.y + 28 + row * 20, 82, 14, 2);
    }
  }
  wg.fillStyle(0x1e293b, 1);
  wg.fillRoundedRect(700, layout.hudSafeAreas.top + 8, 188, 70, 5);
  text(scene, wall, 794, layout.hudSafeAreas.top + 24, "CONSENSUS", 10, "#94a3b8");
  for (let i = 0; i < 6; i += 1) {
    wg.fillStyle(i < 4 ? 0x22c55e : 0x475569, 1);
    wg.fillRect(724 + i * 24, layout.hudSafeAreas.top + 42, 16, 18);
  }

  const rug = layer(scene, OFFICE_ZONE_DEPTHS.floor + 1, sx, sy);
  const rugGraphics = graphics(scene, rug);
  rugGraphics.fillStyle(0x365875, 0.2);
  rugGraphics.fillRoundedRect(268, 142, 392, 300, 22);
  rugGraphics.lineStyle(3, 0x47779f, 0.35);
  rugGraphics.strokeRoundedRect(278, 152, 372, 280, 18);

  const back = layer(scene, officeFootDepth(244), sx, sy);
  layout.seats.filter((seat) => seat.row === "back").forEach((seat) => drawChair(scene, back, seat.x, seat.y + 16, 0x475569));

  const table = layer(scene, officeFootDepth(356), sx, sy);
  const tg = graphics(scene, table);
  tg.fillStyle(0x4b2d19, 1);
  tg.fillEllipse(480, 296, 292, 150);
  tg.fillStyle(0x8b4a20, 1);
  tg.fillEllipse(480, 282, 292, 142);
  tg.lineStyle(5, 0xc57a35, 1);
  tg.strokeEllipse(480, 282, 270, 122);
  tg.fillStyle(0x172033, 1);
  tg.fillRoundedRect(432, 252, 96, 54, 5);
  tg.fillStyle(0x38bdf8, 1);
  tg.fillRect(440, 260, 80, 38);
  tg.fillStyle(0xf8fafc, 1);
  tg.fillRect(366, 264, 42, 30);
  tg.fillRect(552, 264, 42, 30);
  tg.fillStyle(0xf59e0b, 1);
  tg.fillCircle(480, 330, 8);

  const front = layer(scene, officeFootDepth(426), sx, sy);
  layout.seats.filter((seat) => seat.row === "front").forEach((seat) => drawChair(scene, front, seat.x, seat.y, 0x334155));
  const fg = graphics(scene, front);
  fg.fillStyle(0x5b3417, 1);
  fg.fillEllipse(480, 326, 270, 58);
  text(scene, front, 480, 347, "TEAM SYNC", 10);

  const materials = layer(scene, officeFootDepth(390), sx, sy);
  const mg = graphics(scene, materials);
  mg.fillStyle(0x334155, 1);
  mg.fillRoundedRect(704, 142, 178, 222, 6);
  mg.fillStyle(0x475569, 1);
  mg.fillRect(716, 160, 154, 188);
  for (let row = 0; row < 4; row += 1) {
    mg.fillStyle(row % 2 === 0 ? 0xf59e0b : 0x38bdf8, 1);
    mg.fillRect(730, 178 + row * 40, 54, 26);
    mg.fillStyle(0xe2e8f0, 1);
    mg.fillRect(796, 178 + row * 40, 58, 26);
  }
  text(scene, materials, 793, 378, "MATERIALS", 10, "#334155");
  drawPlant(scene, materials, 692, 430);
  drawPlant(scene, materials, 894, 430);
}

function drawReviewStation(scene: Scene, sx: number, sy: number) {
  const layout = buildReviewStationLayout(960, 540);
  drawRoomShell(scene, sx, sy, 0xc7cbd4, 0x334155);

  const aisle = layer(scene, OFFICE_ZONE_DEPTHS.floor + 1, sx, sy);
  const ag = graphics(scene, aisle);
  const aisleBottom = layout.hudSafeArea.y + layout.hudSafeArea.height;
  ag.fillStyle(0x1e3a5f, 0.28);
  ag.fillRect(438, 164, 84, aisleBottom - 164);
  ag.lineStyle(2, 0x60a5fa, 0.26);
  ag.strokeRect(446, 164, 68, aisleBottom - 164);
  ag.fillStyle(0xf8fafc, 0.16);
  ag.fillCircle(layout.presentationSpot.x, layout.presentationSpot.y, 34);

  const screen = layer(scene, OFFICE_ZONE_DEPTHS.fixtures, sx, sy);
  const sg = graphics(scene, screen);
  sg.fillStyle(0x111827, 1);
  const screenTop = layout.hudSafeAreas.top + 8;
  sg.fillRoundedRect(326, screenTop, 308, 104, 6);
  sg.fillStyle(0x1e293b, 1);
  sg.fillRect(338, screenTop + 12, 284, 80);
  text(scene, screen, 480, screenTop + 22, "REVIEW CONTROL", 13);
  const stats = [
    { x: 360, value: "08", label: "AI QUEUE", color: 0x38bdf8 },
    { x: 426, value: "03", label: "PENDING", color: 0xf59e0b },
    { x: 492, value: "12", label: "DECIDED", color: 0x22c55e },
    { x: 558, value: "01", label: "FLAGGED", color: 0xef4444 },
  ];
  for (const stat of stats) {
    sg.fillStyle(stat.color, 1);
    sg.fillRoundedRect(stat.x, screenTop + 38, 52, 30, 3);
    text(scene, screen, stat.x + 26, screenTop + 50, stat.value, 13, "#0f172a");
    text(scene, screen, stat.x + 26, screenTop + 80, stat.label, 7, "#cbd5e1");
  }

  const waiting = layer(scene, officeFootDepth(180), sx, sy);
  const wg = graphics(scene, waiting);
  for (const sideX of [72, 706]) {
    wg.fillStyle(0x334155, 1);
    wg.fillRoundedRect(sideX, 178, 182, 212, 7);
    text(scene, waiting, sideX + 91, 198, sideX < 400 ? "WAITING A" : "WAITING B", 10);
    for (let row = 0; row < 2; row += 1) {
      wg.fillStyle(0x64748b, 1);
      wg.fillRoundedRect(sideX + 20, 224 + row * 74, 142, 44, 5);
      wg.fillStyle(row === 0 ? 0xf59e0b : 0x38bdf8, 1);
      wg.fillCircle(sideX + 34, 238 + row * 74, 5);
      wg.fillStyle(row === 0 ? 0xf59e0b : 0x38bdf8, 0.7);
      wg.fillRect(sideX + 52, 244 + row * 74, 96, 4);
    }
  }

  const deskBack = layer(scene, officeFootDepth(170), sx, sy);
  const dg = graphics(scene, deskBack);
  dg.fillStyle(0x334155, 1);
  dg.fillRoundedRect(344, 184, 272, 126, 8);
  for (let i = 0; i < 3; i += 1) {
    dg.fillStyle(0x111827, 1);
    dg.fillRect(372 + i * 76, 174, 62, 50);
    dg.fillStyle(i === 1 ? 0xf59e0b : 0x38bdf8, 0.92);
    dg.fillRect(378 + i * 76, 180, 50, 36);
  }
  const deskFront = layer(scene, officeFootDepth(330), sx, sy);
  const fg = graphics(scene, deskFront);
  fg.fillStyle(0x5b3417, 1);
  fg.fillRect(356, 226, 248, 82);
  fg.fillStyle(0x8b4a20, 1);
  fg.fillRect(344, 218, 272, 18);
  fg.fillStyle(0xf8fafc, 1);
  fg.fillRect(390, 244, 54, 30);
  fg.fillRect(516, 244, 54, 30);
  fg.fillStyle(0xef4444, 1);
  fg.fillCircle(480, 258, 14);
  text(scene, deskFront, 480, 258, "判", 11, "#ffffff");
  fg.fillStyle(0x4b2d19, 1);
  fg.fillRect(356, 286, 248, 38);
  fg.fillStyle(0x8b4a20, 1);
  fg.fillRect(368, 294, 224, 22);
  text(scene, deskFront, 480, 306, "DECISION DESK", 11);

  const qa = layer(scene, officeFootDepth(452), sx, sy);
  const qg = graphics(scene, qa);
  qg.fillStyle(0x172033, 1);
  qg.fillRoundedRect(692, 392, 192, 72, 6);
  qg.fillStyle(0x38bdf8, 1);
  qg.fillRect(710, 404, 72, 42);
  qg.fillStyle(0x475569, 1);
  qg.fillRect(794, 404, 72, 42);
  text(scene, qa, 788, 462, "QUALITY EVIDENCE", 9, "#334155");
  drawPlant(scene, qa, 674, 466);
  drawPlant(scene, qa, 902, 466);
}

export function drawDedicatedOfficeZone(
  scene: Scene,
  zoneId: string,
  viewportWidth: number,
  viewportHeight: number,
): boolean {
  const sx = viewportWidth / 960;
  const sy = viewportHeight / 540;
  if (zoneId === "lobby") {
    drawLobby(scene, sx, sy);
    return true;
  }
  if (zoneId === "collab-room") {
    drawCollabRoom(scene, sx, sy);
    return true;
  }
  if (zoneId === "review-station") {
    drawReviewStation(scene, sx, sy);
    return true;
  }
  return false;
}
