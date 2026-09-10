import { describe, expect, it } from "vitest";
import {
  INITIAL_WORKSTATION_ROLE_KEYS,
  WORKSTATION_HOME_BY_ROLE,
  avatarMoveCommandSchema,
  avatarMovementSchema,
  isWorkstationTargetWalkable,
} from "./agent-world.js";

describe("private Agent workstation contracts", () => {
  it("exposes the four initial model-selectable roles and their home positions", () => {
    expect(INITIAL_WORKSTATION_ROLE_KEYS).toEqual([
      "ta",
      "frontend-developer",
      "qa",
      "deployment-release",
    ]);
    expect(WORKSTATION_HOME_BY_ROLE.qa).toEqual({
      x: 122,
      y: 348,
      facing: "right",
    });
  });

  it("accepts canonical workstation movement and rejects out-of-bounds targets", () => {
    expect(
      avatarMoveCommandSchema.safeParse({
        commandId: "move-1",
        targetX: 468,
        targetY: 282,
      }).success,
    ).toBe(true);
    expect(
      avatarMoveCommandSchema.safeParse({
        commandId: "move-2",
        targetX: 999,
        targetY: 282,
      }).success,
    ).toBe(false);
  });

  it("requires versioned movement broadcasts", () => {
    expect(
      avatarMovementSchema.parse({
        commandId: "move-1",
        studentId: "student-1",
        zone: "workstations",
        targetX: 468,
        targetY: 282,
        facing: "down",
        revision: 3,
        source: "manual",
        updatedAt: "2026-07-15T08:00:00.000Z",
      }).revision,
    ).toBe(3);
  });

  it("keeps click targets away from walls and workstation furniture", () => {
    expect(isWorkstationTargetWalkable(468, 282)).toBe(true);
    expect(isWorkstationTargetWalkable(122, 214)).toBe(false);
    expect(isWorkstationTargetWalkable(24, 282)).toBe(false);
  });
});
