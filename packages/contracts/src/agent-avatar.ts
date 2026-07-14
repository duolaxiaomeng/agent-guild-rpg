import { z } from "zod";

/**
 * Agent avatar status enum.
 * - online: active and available
 * - working: currently submitting / coding
 * - reviewing: submission is being reviewed
 * - idle: online but no recent activity
 * - offline: not online
 */
export const agentStatusSchema = z.enum([
  "online",
  "working",
  "reviewing",
  "idle",
  "offline",
]);

/**
 * The pixel-world zone where an agent currently resides.
 */
export const agentZoneSchema = z.enum([
  "lobby",
  "workstations",
  "collab-room",
  "review-station",
]);

/**
 * A single agent avatar state, derived from backend business truth.
 */
export const agentAvatarSchema = z.object({
  studentId: z.string().min(1),
  displayName: z.string(),
  status: agentStatusSchema,
  currentZone: agentZoneSchema,
  lastActiveAt: z.string(),
  activitySummary: z.string(),
});

export type AgentStatus = z.infer<typeof agentStatusSchema>;
export type AgentZone = z.infer<typeof agentZoneSchema>;
export type AgentAvatar = z.infer<typeof agentAvatarSchema>;
