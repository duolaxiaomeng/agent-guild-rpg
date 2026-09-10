import { z } from "zod";

/** The first four roles an attached local Agent may choose for its workstation. */
export const INITIAL_WORKSTATION_ROLE_KEYS = [
  "ta",
  "frontend-developer",
  "qa",
  "deployment-release",
] as const;

export const initialWorkstationRoleSchema = z.enum(
  INITIAL_WORKSTATION_ROLE_KEYS,
);

export type InitialWorkstationRole = z.infer<
  typeof initialWorkstationRoleSchema
>;

export const workstationFacingSchema = z.enum([
  "left",
  "right",
  "up",
  "down",
]);

export type WorkstationFacing = z.infer<typeof workstationFacingSchema>;

/** Canonical 960×540 workstation-space bounds. */
export const WORKSTATION_WORLD_BOUNDS = {
  minX: 22,
  maxX: 938,
  minY: 28,
  maxY: 514,
} as const;

export const WORKSTATION_HOME_BY_ROLE: Record<
  InitialWorkstationRole,
  { x: number; y: number; facing: WorkstationFacing }
> = {
  ta: { x: 122, y: 214, facing: "right" },
  "frontend-developer": { x: 316, y: 214, facing: "left" },
  qa: { x: 122, y: 348, facing: "right" },
  "deployment-release": { x: 316, y: 348, facing: "left" },
};

export const WORKSTATION_HOME_BY_VISUAL_ROLE = {
  browser: { x: 122, y: 214, facing: "right" },
  coder: { x: 316, y: 214, facing: "left" },
  files: { x: 122, y: 348, facing: "right" },
  ops: { x: 316, y: 348, facing: "left" },
  lead: { x: 482, y: 454, facing: "down" },
} as const;

/** Furniture collision rectangles in canonical workstation coordinates. */
export const WORKSTATION_NAV_OBSTACLES = [
  { id: "browser-desk", x: 76, y: 164, width: 92, height: 74 },
  { id: "coder-desk", x: 270, y: 164, width: 92, height: 74 },
  { id: "files-desk", x: 76, y: 298, width: 92, height: 74 },
  { id: "ops-desk", x: 270, y: 298, width: 92, height: 74 },
  { id: "lead-desk", x: 396, y: 420, width: 168, height: 76 },
  { id: "lounge-block", x: 568, y: 120, width: 334, height: 300 },
  { id: "review-room", x: 748, y: 382, width: 142, height: 112 },
] as const;

export function isWorkstationTargetWalkable(
  x: number,
  y: number,
  padding = 12,
) {
  if (
    x < WORKSTATION_WORLD_BOUNDS.minX + padding ||
    x > WORKSTATION_WORLD_BOUNDS.maxX - padding ||
    y < WORKSTATION_WORLD_BOUNDS.minY + padding ||
    y > WORKSTATION_WORLD_BOUNDS.maxY - padding
  ) {
    return false;
  }

  return !WORKSTATION_NAV_OBSTACLES.some(
    (obstacle) =>
      x >= obstacle.x - padding &&
      x <= obstacle.x + obstacle.width + padding &&
      y >= obstacle.y - padding &&
      y <= obstacle.y + obstacle.height + padding,
  );
}

export const agentWorldPositionSchema = z.object({
  zone: z.literal("workstations"),
  x: z.number().min(WORKSTATION_WORLD_BOUNDS.minX).max(WORKSTATION_WORLD_BOUNDS.maxX),
  y: z.number().min(WORKSTATION_WORLD_BOUNDS.minY).max(WORKSTATION_WORLD_BOUNDS.maxY),
  facing: workstationFacingSchema,
  revision: z.number().int().nonnegative(),
  updatedAt: z.string().datetime(),
});

export type AgentWorldPosition = z.infer<typeof agentWorldPositionSchema>;

export const avatarMovementLockReasonSchema = z.enum([
  "task_running",
  "reviewing",
]);

export type AvatarMovementLockReason = z.infer<
  typeof avatarMovementLockReasonSchema
>;

export const avatarMoveCommandSchema = z.object({
  commandId: z.string().trim().min(1).max(128),
  targetX: z.number().min(WORKSTATION_WORLD_BOUNDS.minX).max(WORKSTATION_WORLD_BOUNDS.maxX),
  targetY: z.number().min(WORKSTATION_WORLD_BOUNDS.minY).max(WORKSTATION_WORLD_BOUNDS.maxY),
});

export type AvatarMoveCommand = z.infer<typeof avatarMoveCommandSchema>;

export const avatarMovementSchema = z.object({
  commandId: z.string().trim().min(1).max(128),
  studentId: z.string().trim().min(1),
  zone: z.literal("workstations"),
  targetX: z.number().min(WORKSTATION_WORLD_BOUNDS.minX).max(WORKSTATION_WORLD_BOUNDS.maxX),
  targetY: z.number().min(WORKSTATION_WORLD_BOUNDS.minY).max(WORKSTATION_WORLD_BOUNDS.maxY),
  facing: workstationFacingSchema,
  revision: z.number().int().nonnegative(),
  source: z.enum(["manual", "system"]),
  updatedAt: z.string().datetime(),
});

export type AvatarMovement = z.infer<typeof avatarMovementSchema>;

export const avatarMoveRejectReasonSchema = z.enum([
  "authentication_required",
  "student_only",
  "role_required",
  "movement_locked",
  "invalid_target",
]);

export const avatarMoveAckSchema = z.discriminatedUnion("accepted", [
  z.object({ accepted: z.literal(true), movement: avatarMovementSchema }),
  z.object({
    accepted: z.literal(false),
    reason: avatarMoveRejectReasonSchema,
  }),
]);

export type AvatarMoveAck = z.infer<typeof avatarMoveAckSchema>;
