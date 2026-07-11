import { z } from "zod";

export const classroomSessionStatusSchema = z.enum([
  "draft",
  "live",
  "completed",
]);

export const classroomStageStatusSchema = z.enum([
  "draft",
  "running",
  "paused",
  "completed",
  "ended_early",
]);

export const classroomStaffRoleSchema = z.enum(["teacher", "assistant"]);

export const helpRequestCategorySchema = z.enum([
  "blocked",
  "environment",
  "question",
  "review",
  "other",
]);

export const helpRequestStatusSchema = z.enum([
  "open",
  "claimed",
  "resolved",
  "cancelled",
]);

export const classroomEventTypeSchema = z.enum([
  "session_started",
  "stage_started",
  "stage_paused",
  "stage_extended",
  "stage_completed",
  "stage_ended_early",
  "stage_unlocked",
  "help_created",
  "help_claimed",
  "help_resolved",
  "help_cancelled",
]);

const idSchema = z.string().trim().min(1);
const dateTimeSchema = z.string().datetime();
const nullableDateTimeSchema = dateTimeSchema.nullable();

export const classroomSessionSchema = z.object({
  id: idSchema,
  courseWorldId: idSchema,
  dayId: idSchema,
  status: classroomSessionStatusSchema,
  version: z.number().int().nonnegative(),
  currentStageId: idSchema.nullable().optional(),
  startedAt: nullableDateTimeSchema.optional(),
  endedAt: nullableDateTimeSchema.optional(),
});

export const classroomStageSchema = z.object({
  id: idSchema,
  title: z.string().trim().min(1).max(200),
  description: z.string().max(2000),
  sortOrder: z.number().int().nonnegative(),
  durationSeconds: z.number().int().nonnegative(),
  extensionSeconds: z.number().int().nonnegative(),
  status: classroomStageStatusSchema,
  version: z.number().int().nonnegative(),
  startedAt: nullableDateTimeSchema,
  pausedAt: nullableDateTimeSchema,
  accumulatedPauseSeconds: z.number().int().nonnegative(),
  remainingSeconds: z.number().int().nonnegative().nullable().optional(),
});

export const classroomViewerSchema = z.object({
  role: z.union([z.literal("teacher"), z.literal("assistant"), z.literal("student")]),
  canControlStages: z.boolean(),
  canHandleHelp: z.boolean(),
});

export const helpRequestSchema = z.object({
  id: idSchema,
  sessionId: idSchema,
  studentId: idSchema,
  category: helpRequestCategorySchema,
  message: z.string().trim().min(1).max(2000),
  status: helpRequestStatusSchema,
  assigneeId: idSchema.nullable(),
  resolutionNote: z.string().max(2000).nullable(),
  createdAt: dateTimeSchema,
  claimedAt: nullableDateTimeSchema,
  resolvedAt: nullableDateTimeSchema,
  version: z.number().int().nonnegative(),
});

export const classroomSnapshotSchema = z.object({
  session: classroomSessionSchema,
  currentStage: classroomStageSchema.nullable(),
  stages: z.array(classroomStageSchema),
  helpRequests: z.array(helpRequestSchema),
  viewer: classroomViewerSchema,
  serverNow: dateTimeSchema,
});

export const classroomControlActionSchema = z.enum([
  "start",
  "pause",
  "extend",
  "complete",
  "end_early",
  "unlock_next",
]);

export const classroomControlInputSchema = z
  .object({
    action: classroomControlActionSchema,
    expectedVersion: z.number().int().nonnegative(),
    seconds: z.number().int().positive().max(86400).optional(),
  })
  .superRefine((input, context) => {
    if (input.action === "extend" && input.seconds === undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["seconds"],
        message: "seconds is required when extending a stage",
      });
    }
  });

export const createHelpRequestSchema = z.object({
  sessionId: idSchema,
  category: helpRequestCategorySchema,
  message: z.string().trim().min(1).max(2000),
});

export const claimHelpRequestSchema = z.object({
  expectedVersion: z.number().int().nonnegative(),
});

export const resolveHelpRequestSchema = z.object({
  resolutionNote: z.string().trim().min(1).max(2000),
  expectedVersion: z.number().int().nonnegative(),
});

export type ClassroomSessionStatus = z.infer<typeof classroomSessionStatusSchema>;
export type ClassroomStageStatus = z.infer<typeof classroomStageStatusSchema>;
export type ClassroomStaffRole = z.infer<typeof classroomStaffRoleSchema>;
export type HelpRequestCategory = z.infer<typeof helpRequestCategorySchema>;
export type HelpRequestStatus = z.infer<typeof helpRequestStatusSchema>;
export type ClassroomEventType = z.infer<typeof classroomEventTypeSchema>;
export type ClassroomSession = z.infer<typeof classroomSessionSchema>;
export type ClassroomStage = z.infer<typeof classroomStageSchema>;
export type ClassroomViewer = z.infer<typeof classroomViewerSchema>;
export type HelpRequest = z.infer<typeof helpRequestSchema>;
export type ClassroomSnapshot = z.infer<typeof classroomSnapshotSchema>;
export type ClassroomControlAction = z.infer<typeof classroomControlActionSchema>;
export type ClassroomControlInput = z.infer<typeof classroomControlInputSchema>;
export type CreateHelpRequestInput = z.infer<typeof createHelpRequestSchema>;
export type ClaimHelpRequestInput = z.infer<typeof claimHelpRequestSchema>;
export type ResolveHelpRequestInput = z.infer<typeof resolveHelpRequestSchema>;
