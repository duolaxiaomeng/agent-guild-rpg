import { describe, expect, it } from "vitest";
import {
  CHARACTER_WALK_FRAME_MS,
  nextCharacterWalkFrame,
  resolveCharacterWalkPose,
} from "./character-motion";

describe("natural character motion", () => {
  it("uses contact and passing phases for a four-step human stride", () => {
    const poses = [0, 1, 2, 3].map(resolveCharacterWalkPose);

    expect(poses.map((pose) => pose.textureFrame)).toEqual([0, 0, 1, 1]);
    expect(new Set(poses.map((pose) => `${pose.yOffset}:${pose.angle}`)).size).toBe(4);
    expect(CHARACTER_WALK_FRAME_MS).toBeGreaterThanOrEqual(140);
    expect(CHARACTER_WALK_FRAME_MS).toBeLessThanOrEqual(180);
  });

  it("loops the walk phase without accumulating an unbounded frame index", () => {
    expect(nextCharacterWalkFrame(0)).toBe(1);
    expect(nextCharacterWalkFrame(3)).toBe(0);
    expect(resolveCharacterWalkPose(7)).toEqual(resolveCharacterWalkPose(3));
  });
});
