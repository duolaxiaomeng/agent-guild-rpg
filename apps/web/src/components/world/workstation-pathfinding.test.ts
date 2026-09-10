import { describe, expect, it } from "vitest";
import { isWorkstationTargetWalkable } from "contracts";
import {
  findWorkstationPath,
  fromCanonicalWorkstationPoint,
  toCanonicalWorkstationPoint,
} from "./workstation-pathfinding";

describe("workstation pathfinding", () => {
  it("keeps persisted positions stable across viewport scaling", () => {
    const screen = fromCanonicalWorkstationPoint({ x: 480, y: 270 }, 1440, 810);
    expect(screen).toEqual({ x: 720, y: 405 });
    expect(toCanonicalWorkstationPoint(screen, 1440, 810)).toEqual({
      x: 480,
      y: 270,
    });
  });

  it("routes around expanded desk collision rectangles", () => {
    const result = findWorkstationPath(
      { x: 46, y: 200 },
      { x: 390, y: 200 },
    );

    expect(result).not.toBeNull();
    expect(result!.points.length).toBeGreaterThan(2);
    expect(
      result!.points.slice(1).every((point) =>
        isWorkstationTargetWalkable(point.x, point.y),
      ),
    ).toBe(true);
  });

  it("snaps a desk click to the nearest reachable point", () => {
    const result = findWorkstationPath(
      { x: 480, y: 140 },
      { x: 122, y: 214 },
    );

    expect(result).not.toBeNull();
    expect(result!.snapped).toBe(true);
    expect(result!.target).not.toEqual({ x: 122, y: 214 });
    expect(isWorkstationTargetWalkable(result!.target.x, result!.target.y)).toBe(true);
  });

  it("preserves an exact free-floor destination", () => {
    const result = findWorkstationPath(
      { x: 480, y: 140 },
      { x: 500, y: 300 },
    );

    expect(result).not.toBeNull();
    expect(result!.snapped).toBe(false);
    expect(result!.target).toEqual({ x: 500, y: 300 });
  });
});
