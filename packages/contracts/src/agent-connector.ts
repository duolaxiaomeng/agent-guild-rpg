import { z } from "zod";

export const agentConnectorStatusSchema = z.enum(["online", "offline", "revoked"]);

export const agentPairingResponseSchema = z.object({
  connectionCredential: z.string().min(40),
  expiresAt: z.string().datetime()
});

export const connectAgentRequestSchema = z.object({
  connectionCredential: z.string().min(40),
  provider: z.string().min(1),
  clientName: z.string().min(1),
  capabilities: z.array(z.string().min(1)).max(50)
});

export const agentConnectorProfileSchema = z.object({
  connectorId: z.string().uuid(),
  agentSessionId: z.string().uuid(),
  provider: z.string().min(1),
  clientName: z.string().min(1),
  status: agentConnectorStatusSchema,
  capabilities: z.array(z.string()),
  connectedAt: z.string().datetime(),
  lastSeenAt: z.string().datetime()
});

export const agentEventSchema = z.object({
  id: z.string().min(1),
  connectorId: z.string().uuid(),
  studentId: z.string().min(1),
  dayId: z.string().min(1),
  type: z.string().min(1),
  payload: z.record(z.unknown()),
  occurredAt: z.string().datetime(),
  createdAt: z.string().datetime()
});

export type AgentPairingResponse = z.infer<typeof agentPairingResponseSchema>;
export type ConnectAgentRequest = z.infer<typeof connectAgentRequestSchema>;
export type AgentConnectorProfile = z.infer<typeof agentConnectorProfileSchema>;
export type AgentEvent = z.infer<typeof agentEventSchema>;
