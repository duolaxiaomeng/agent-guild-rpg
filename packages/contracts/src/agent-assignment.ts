import { z } from "zod";

const assignmentIdSchema = z.string().trim().min(1).max(128);

export const agentAssignmentStatusSchema = z.enum([
  "blocked",
  "queued",
  "leased",
  "running",
  "completed",
  "failed",
  "needs_teacher",
  "cancelled",
]);

export const agentAssignmentResultSchema = z
  .object({
    runId: z.string().optional(),
    dayId: z.string().optional(),
    provider: z.string().optional(),
    succeeded: z.boolean().optional(),
    exitCode: z.number().int().nullable().optional(),
    signal: z.string().nullable().optional(),
    output: z.string().optional(),
    outputTruncated: z.boolean().optional(),
    timedOut: z.boolean().optional(),
    cancelled: z.boolean().optional(),
    durationMs: z.number().int().nonnegative().optional(),
  })
  .passthrough();

export const agentAssignmentSubmissionSchema = z.object({
  id: assignmentIdSchema,
  reviewStatus: z.enum([
    "queued",
    "ai_reviewed",
    "needs_teacher",
    "teacher_decided",
  ]),
  decision: z.enum(["approve", "adjust", "reject"]).nullable(),
});

export const agentAssignmentRunSchema = z.object({
  id: assignmentIdSchema,
  runId: assignmentIdSchema,
  studentId: assignmentIdSchema,
  courseWorldId: assignmentIdSchema.nullable(),
  dayId: assignmentIdSchema.nullable(),
  guildId: assignmentIdSchema.nullable(),
  provider: z.string().trim().min(1).max(80),
  input: z.unknown(),
  dependencies: z.array(assignmentIdSchema),
  requiredCapabilities: z.array(z.string().trim().min(1).max(120)),
  priority: z.number().int().min(-1000).max(1000),
  resourceClass: z.enum(["light", "heavy"]),
  status: agentAssignmentStatusSchema,
  attemptCount: z.number().int().nonnegative(),
  maxAttempts: z.number().int().min(1).max(10),
  blockedByCount: z.number().int().nonnegative(),
  failureReason: z.string().nullable(),
  result: agentAssignmentResultSchema.nullable(),
  submission: agentAssignmentSubmissionSchema.nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const createAgentAssignmentSchema = z.object({
  runId: assignmentIdSchema,
  studentId: assignmentIdSchema,
  provider: z.string().trim().min(1).max(80),
  input: z
    .object({
      instruction: z.string().trim().min(1).max(12000),
      args: z.array(z.string()).max(100).optional(),
      cwd: z.string().trim().min(1).max(2048).optional(),
    })
    .passthrough(),
  dependencies: z.array(assignmentIdSchema).max(100).optional(),
  courseWorldId: assignmentIdSchema.optional(),
  dayId: assignmentIdSchema.optional(),
  guildId: assignmentIdSchema.optional(),
  requiredCapabilities: z
    .array(z.string().trim().min(1).max(120))
    .max(50)
    .optional(),
  priority: z.number().int().min(-1000).max(1000).optional(),
  resourceClass: z.enum(["light", "heavy"]).optional(),
  maxAttempts: z.number().int().min(1).max(10).optional(),
});

export const confirmAgentAssignmentSchema = z.object({
  runId: assignmentIdSchema,
  selfReflection: z.string().trim().min(20).max(12000),
});

export type AgentAssignmentStatus = z.infer<
  typeof agentAssignmentStatusSchema
>;
export type AgentAssignmentResult = z.infer<
  typeof agentAssignmentResultSchema
>;
export type AgentAssignmentSubmission = z.infer<
  typeof agentAssignmentSubmissionSchema
>;
export type AgentAssignmentRun = z.infer<typeof agentAssignmentRunSchema>;
export type CreateAgentAssignment = z.infer<
  typeof createAgentAssignmentSchema
>;
export type ConfirmAgentAssignment = z.infer<
  typeof confirmAgentAssignmentSchema
>;
