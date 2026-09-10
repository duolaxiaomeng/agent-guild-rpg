import { z } from "zod";
import { agentRoleSchema, agentVisualRoleSchema } from "./agent-team.js";

export const agentConnectorStatusSchema = z.enum(["online", "offline", "revoked"]);
export const agentTaskResourceClassSchema = z.enum(["light", "heavy"]);
export const agentTaskStatusSchema = z.enum([
  "blocked",
  "queued",
  "leased",
  "running",
  "completed",
  "failed",
  "needs_teacher",
  "cancelled"
]);
export const agentTaskFailureKindSchema = z.enum(["infrastructure", "business"]);

export const agentPairingResponseSchema = z.object({
  connectionCredential: z.string().min(40),
  expiresAt: z.string().datetime()
});

export const connectAgentRequestSchema = z.object({
  connectionCredential: z.string().min(40),
  provider: z.string().min(1),
  clientName: z.string().min(1),
  capabilities: z.array(z.string().min(1)).max(50),
  roleKey: agentRoleSchema.optional(),
});

export const agentConnectorProfileSchema = z.object({
  connectorId: z.string().uuid(),
  agentSessionId: z.string().uuid(),
  provider: z.string().min(1),
  clientName: z.string().min(1),
  status: agentConnectorStatusSchema,
  capabilities: z.array(z.string()),
  roleKey: agentRoleSchema.nullable(),
  visualRole: agentVisualRoleSchema.nullable(),
  connectedAt: z.string().datetime(),
  lastSeenAt: z.string().datetime()
});

export const agentEventSchema = z.object({
  id: z.string().min(1),
  eventId: z.string().min(1).max(128),
  connectorId: z.string().uuid(),
  studentId: z.string().min(1),
  dayId: z.string().min(1),
  type: z.string().min(1),
  payload: z.record(z.unknown()),
  occurredAt: z.string().datetime(),
  createdAt: z.string().datetime()
});

export const agentEventInputSchema = z.object({
  eventId: z.string().trim().min(1).max(128),
  dayId: z.string().trim().min(1).max(128),
  type: z.string().trim().min(1).max(120),
  payload: z.record(z.unknown()),
  occurredAt: z.string().datetime()
});

export const agentEventBatchSchema = z.object({
  events: z.array(agentEventInputSchema).min(1).max(100)
});

export const agentEventCursorQuerySchema = z.object({
  cursor: z.string().trim().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50)
});

export const agentTaskScopeSchema = z.object({
  courseWorldId: z.string().trim().min(1).nullable(),
  dayId: z.string().trim().min(1).nullable(),
  guildId: z.string().trim().min(1).nullable(),
  studentId: z.string().trim().min(1)
});

export const agentConnectorTaskSchema = z.object({
  id: z.string().trim().min(1),
  runId: z.string().trim().min(1).max(128),
  scope: agentTaskScopeSchema,
  provider: z.string().trim().min(1).max(80),
  requiredCapabilities: z.array(z.string().trim().min(1).max(120)).max(50),
  priority: z.number().int().min(-1000).max(1000),
  resourceClass: agentTaskResourceClassSchema,
  status: agentTaskStatusSchema,
  payload: z.record(z.unknown()),
  attemptCount: z.number().int().nonnegative(),
  maxAttempts: z.number().int().min(1).max(10),
  createdAt: z.string().datetime()
});

export const agentTaskClaimRequestSchema = z.object({
  lightCapacity: z.number().int().min(0).max(8).default(1),
  heavyCapacity: z.number().int().min(0).max(1).default(1),
  waitSeconds: z.number().int().min(0).max(25).default(25)
});

export const agentTaskLeaseSchema = z.object({
  task: agentConnectorTaskSchema,
  leaseToken: z.string().min(32),
  leaseExpiresAt: z.string().datetime(),
  heartbeatIntervalSeconds: z.number().int().positive().default(15)
});

export const agentTaskHeartbeatSchema = z.object({
  leaseToken: z.string().min(32)
});

export const agentTaskCompleteSchema = agentTaskHeartbeatSchema.extend({
  result: z.unknown()
});

export const agentTaskFailSchema = agentTaskHeartbeatSchema.extend({
  kind: agentTaskFailureKindSchema,
  error: z.string().trim().min(1).max(8000)
});

export type AgentPairingResponse = z.infer<typeof agentPairingResponseSchema>;
export type ConnectAgentRequest = z.infer<typeof connectAgentRequestSchema>;
export type AgentConnectorProfile = z.infer<typeof agentConnectorProfileSchema>;
export type AgentEvent = z.infer<typeof agentEventSchema>;
export type AgentEventInput = z.infer<typeof agentEventInputSchema>;
export type AgentEventBatch = z.infer<typeof agentEventBatchSchema>;
export type AgentEventCursorQuery = z.infer<typeof agentEventCursorQuerySchema>;
export type AgentTaskResourceClass = z.infer<typeof agentTaskResourceClassSchema>;
export type AgentTaskStatus = z.infer<typeof agentTaskStatusSchema>;
export type AgentTaskFailureKind = z.infer<typeof agentTaskFailureKindSchema>;
export type AgentTaskScope = z.infer<typeof agentTaskScopeSchema>;
export type AgentConnectorTask = z.infer<typeof agentConnectorTaskSchema>;
export type AgentTaskClaimRequest = z.infer<typeof agentTaskClaimRequestSchema>;
export type AgentTaskLease = z.infer<typeof agentTaskLeaseSchema>;
export type AgentTaskHeartbeat = z.infer<typeof agentTaskHeartbeatSchema>;
export type AgentTaskComplete = z.infer<typeof agentTaskCompleteSchema>;
export type AgentTaskFail = z.infer<typeof agentTaskFailSchema>;
