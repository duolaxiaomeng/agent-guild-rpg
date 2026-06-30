import { describe, expect, it } from "vitest";
import { T, ZONE_DEFS } from "./zone-config";
import { buildOfficeTilesForZone, buildWorkstationsLayout } from "./phaser-scene";

describe("buildWorkstationsLayout", () => {
  it("returns the office composition anchors from the reference", () => {
    const layout = buildWorkstationsLayout(960, 540);

    expect(layout.wallBand).toEqual({ x: 48, y: 36, width: 864, height: 76 });
    expect(layout.doubleDeskAnchors).toEqual([
      { x: 190, y: 236 },
      { x: 340, y: 228 },
      { x: 184, y: 340 },
      { x: 336, y: 334 },
    ]);
    expect(layout.multiScreenDesk).toEqual({ x: 170, y: 420 });
    expect(layout.focusDesk).toEqual({ x: 512, y: 416 });
    expect(layout.loungeRect).toEqual({ x: 592, y: 262, width: 282, height: 214 });
    expect(layout.walkerAnchors).toEqual([
      { x: 736, y: 194 },
      { x: 812, y: 222 },
    ]);
    expect(layout.cameraZoom).toBe(1.16);
  });
});

describe("buildOfficeTilesForZone", () => {
  it("uses gray tile workspace with a wood lounge for workstations", () => {
    const zone = ZONE_DEFS.find((item) => item.id === "workstations")!;
    const data = buildOfficeTilesForZone(48, 30, zone, 960, 540);

    expect(data[2][8]).toBe(T.FLOOR + 1);
    expect(data[12][9]).toBe(T.STONE + 1);
    expect(data[23][36]).toBe(T.WOOD + 1);
    expect(data[23][42]).toBe(T.WOOD_ALT + 1);
  });
});
