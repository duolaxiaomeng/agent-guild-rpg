import { z } from "zod";

const idSchema = z.string().trim().min(1);
const dateTimeSchema = z.string().datetime();
const nullableDateTimeSchema = dateTimeSchema.nullable();

export const teacherTaskStatusSchema = z.enum([
  "open",
  "locked",
  "completed",
]);

export const teacherTaskProgressStatusSchema = z.enum([
  "not_started",
  "submitted",
  "reviewed",
]);

export const acceptanceCriteriaSchema = z
  .array(z.string().trim().min(1).max(500))
  .min(1)
  .max(20);

export const teacherTaskSchema = z.object({
  courseWorldId: idSchema,
  dayId: idSchema,
  title: z.string().trim().min(1).max(200),
  status: teacherTaskStatusSchema,
  description: z.string().trim().min(1).max(4000),
  homework: z.string().trim().min(1).max(4000),
  acceptanceCriteria: acceptanceCriteriaSchema,
  dueAt: nullableDateTimeSchema,
  publishedAt: nullableDateTimeSchema,
  teacherId: idSchema.nullable(),
});

export const createTeacherTaskInputSchema = teacherTaskSchema.omit({
  teacherId: true,
});

export const teacherTaskStudentProgressSchema = z.object({
  studentId: idSchema,
  displayName: z.string().trim().min(1).max(200),
  status: teacherTaskProgressStatusSchema,
  submissionId: idSchema.nullable(),
  submittedAt: nullableDateTimeSchema,
  reviewedAt: nullableDateTimeSchema,
});

export const teacherTaskProgressSummarySchema = z.object({
  total: z.number().int().nonnegative(),
  notStarted: z.number().int().nonnegative(),
  submitted: z.number().int().nonnegative(),
  reviewed: z.number().int().nonnegative(),
});

export const teacherTaskProgressPayloadSchema = teacherTaskSchema.extend({
  summary: teacherTaskProgressSummarySchema,
  students: z.array(teacherTaskStudentProgressSchema),
});

export type TeacherTaskStatus = z.infer<typeof teacherTaskStatusSchema>;
export type TeacherTaskProgressStatus = z.infer<
  typeof teacherTaskProgressStatusSchema
>;
export type TeacherTask = z.infer<typeof teacherTaskSchema>;
export type CreateTeacherTaskInput = z.infer<
  typeof createTeacherTaskInputSchema
>;
export type TeacherTaskStudentProgress = z.infer<
  typeof teacherTaskStudentProgressSchema
>;
export type TeacherTaskProgressSummary = z.infer<
  typeof teacherTaskProgressSummarySchema
>;
export type TeacherTaskProgressPayload = z.infer<
  typeof teacherTaskProgressPayloadSchema
>;
