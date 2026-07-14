import { z } from "zod";

const idSchema = z.string().trim().min(1);
const dateTimeSchema = z.string().datetime();

/** Stable role keys used by the global Agent team. */
export const agentRoleSchema = z.enum([
  "ta",
  "reviewer",
  "mentor",
  "qa",
  "philosophy-design-mentor",
  "software-architect",
  "deployment-release",
  "frontend-developer",
  "backend-developer",
  "operations-architect",
]);

export type AgentRole = z.infer<typeof agentRoleSchema>;

/** Capability tags are intentionally shared across roles and tasks. */
export const agentCapabilitySchema = z.enum([
  "teaching",
  "reviewing",
  "mentoring",
  "testing",
  "debugging",
  "philosophy",
  "design-thinking",
  "software-design",
  "architecture",
  "deployment",
  "release",
  "frontend",
  "backend",
  "operations",
  "observability",
  "documentation",
]);

export type AgentCapability = z.infer<typeof agentCapabilitySchema>;

/** Lifecycle of an Agent or an assigned unit of work. */
export const agentTeamStatusSchema = z.enum([
  "queued",
  "assigned",
  "in_progress",
  "blocked",
  "completed",
  "failed",
  "cancelled",
]);

export type AgentTeamStatus = z.infer<typeof agentTeamStatusSchema>;

export const agentTaskPrioritySchema = z.enum([
  "low",
  "normal",
  "high",
  "critical",
]);

export type AgentTaskPriority = z.infer<typeof agentTaskPrioritySchema>;

/** A unit of work assigned to one role in the team. */
export const agentTaskSchema = z.object({
  id: idSchema,
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().min(1).max(4000),
  role: agentRoleSchema,
  capabilities: z.array(agentCapabilitySchema).min(1).max(20),
  status: agentTeamStatusSchema,
  priority: agentTaskPrioritySchema,
  assigneeId: idSchema.optional(),
  createdAt: dateTimeSchema,
  startedAt: dateTimeSchema.optional(),
  completedAt: dateTimeSchema.optional(),
  dueAt: dateTimeSchema.optional(),
});

export type AgentTask = z.infer<typeof agentTaskSchema>;

export const agentRunStatusSchema = z.enum([
  "queued",
  "running",
  "paused",
  "completed",
  "failed",
  "cancelled",
]);

export type AgentRunStatus = z.infer<typeof agentRunStatusSchema>;

export const createAgentOrchestrationRunSchema = z.object({
  runId: idSchema.max(128),
  input: z.unknown().optional(),
  dependencies: z.array(idSchema.max(128)).max(100).optional()
});

export const agentOrchestrationRunSchema = z.object({
  runId: idSchema.max(128),
  input: z.unknown().optional(),
  dependencies: z.array(idSchema.max(128)),
  status: agentRunStatusSchema,
  result: z.unknown().optional(),
  error: z.string().optional()
});

export type CreateAgentOrchestrationRun = z.infer<
  typeof createAgentOrchestrationRunSchema
>;
export type AgentOrchestrationRun = z.infer<typeof agentOrchestrationRunSchema>;

/** Snapshot of work being processed concurrently by the team. */
export const agentRunSummarySchema = z
  .object({
    runId: idSchema,
    status: agentRunStatusSchema,
    totalTasks: z.number().int().nonnegative(),
    queuedTasks: z.number().int().nonnegative(),
    activeTasks: z.number().int().nonnegative(),
    completedTasks: z.number().int().nonnegative(),
    failedTasks: z.number().int().nonnegative(),
    maxConcurrency: z.number().int().positive(),
    startedAt: dateTimeSchema,
    updatedAt: dateTimeSchema,
    completedAt: dateTimeSchema.optional(),
  })
  .superRefine((summary, context) => {
    const accountedTasks =
      summary.queuedTasks +
      summary.activeTasks +
      summary.completedTasks +
      summary.failedTasks;

    if (accountedTasks > summary.totalTasks) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["totalTasks"],
        message: "task counters cannot exceed totalTasks",
      });
    }

    if (summary.activeTasks > summary.maxConcurrency) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["activeTasks"],
        message: "activeTasks cannot exceed maxConcurrency",
      });
    }
  });

export type AgentRunSummary = z.infer<typeof agentRunSummarySchema>;

export const agentHandoffArtifactSchema = z.object({
  kind: z.string().trim().min(1).max(80),
  uri: z.string().url(),
});

export type AgentHandoffArtifact = z.infer<typeof agentHandoffArtifactSchema>;

/** Context passed when one Agent role transfers work to another. */
export const agentHandoffSchema = z.object({
  id: idSchema,
  taskId: idSchema,
  fromRole: agentRoleSchema,
  toRole: agentRoleSchema,
  summary: z.string().trim().min(1).max(4000),
  completedWork: z.array(z.string().trim().min(1).max(1000)).min(1).max(50),
  nextActions: z.array(z.string().trim().min(1).max(1000)).min(1).max(50),
  artifacts: z.array(agentHandoffArtifactSchema).max(50),
  blockers: z.array(z.string().trim().min(1).max(1000)).max(50),
  createdAt: dateTimeSchema,
});

export type AgentHandoff = z.infer<typeof agentHandoffSchema>;

// Explicit aliases keep the contract discoverable without duplicating schemas.
export const agentTeamRoleSchema = agentRoleSchema;
export const agentCapabilityTagSchema = agentCapabilitySchema;
export const agentTaskAssignmentSchema = agentTaskSchema;
export const agentConcurrentRunSummarySchema = agentRunSummarySchema;

export type AgentTeamRole = AgentRole;
export type AgentCapabilityTag = AgentCapability;
export type AgentTaskAssignment = AgentTask;
export type AgentConcurrentRunSummary = AgentRunSummary;
