import { describe, expect, it } from "vitest";
import { buildWorkstationsLayout } from "./phaser-scene";

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
