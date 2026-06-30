import { describe, expect, it } from "vitest";
import { T, ZONE_DEFS } from "./zone-config";
import { buildOfficeTilesForZone, buildWorkstationsLayout } from "./phaser-scene";

describe("buildWorkstationsLayout", () => {
  it("returns the office composition anchors from the reference", () => {
    const layout = buildWorkstationsLayout(960, 540);

    expect(layout.wallBand).toEqual({ x: 64, y: 44, width: 832, height: 70 });
    expect(layout.doubleDeskAnchors).toHaveLength(4);
    expect(layout.multiScreenDesk).toEqual({ x: 160, y: 392 });
    expect(layout.focusDesk).toEqual({ x: 470, y: 394 });
    expect(layout.loungeRect).toEqual({ x: 610, y: 286, width: 246, height: 184 });
    expect(layout.walkerAnchors).toEqual([
      { x: 756, y: 176 },
      { x: 822, y: 196 },
    ]);
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
