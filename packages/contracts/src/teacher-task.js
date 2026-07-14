"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.teacherTaskProgressPayloadSchema = exports.teacherTaskProgressSummarySchema = exports.teacherTaskStudentProgressSchema = exports.createTeacherTaskInputSchema = exports.teacherTaskSchema = exports.acceptanceCriteriaSchema = exports.teacherTaskProgressStatusSchema = exports.teacherTaskStatusSchema = void 0;
const zod_1 = require("zod");
const idSchema = zod_1.z.string().trim().min(1);
const dateTimeSchema = zod_1.z.string().datetime();
const nullableDateTimeSchema = dateTimeSchema.nullable();
exports.teacherTaskStatusSchema = zod_1.z.enum([
    "open",
    "locked",
    "completed",
]);
exports.teacherTaskProgressStatusSchema = zod_1.z.enum([
    "not_started",
    "submitted",
    "reviewed",
]);
exports.acceptanceCriteriaSchema = zod_1.z
    .array(zod_1.z.string().trim().min(1).max(500))
    .min(1)
    .max(20);
exports.teacherTaskSchema = zod_1.z.object({
    courseWorldId: idSchema,
    dayId: idSchema,
    title: zod_1.z.string().trim().min(1).max(200),
    status: exports.teacherTaskStatusSchema,
    description: zod_1.z.string().trim().min(1).max(4000),
    homework: zod_1.z.string().trim().min(1).max(4000),
    acceptanceCriteria: exports.acceptanceCriteriaSchema,
    dueAt: nullableDateTimeSchema,
    publishedAt: nullableDateTimeSchema,
    teacherId: idSchema.nullable(),
});
exports.createTeacherTaskInputSchema = exports.teacherTaskSchema.omit({
    teacherId: true,
});
exports.teacherTaskStudentProgressSchema = zod_1.z.object({
    studentId: idSchema,
    displayName: zod_1.z.string().trim().min(1).max(200),
    status: exports.teacherTaskProgressStatusSchema,
    submissionId: idSchema.nullable(),
    submittedAt: nullableDateTimeSchema,
    reviewedAt: nullableDateTimeSchema,
});
exports.teacherTaskProgressSummarySchema = zod_1.z.object({
    total: zod_1.z.number().int().nonnegative(),
    notStarted: zod_1.z.number().int().nonnegative(),
    submitted: zod_1.z.number().int().nonnegative(),
    reviewed: zod_1.z.number().int().nonnegative(),
});
exports.teacherTaskProgressPayloadSchema = exports.teacherTaskSchema.extend({
    summary: exports.teacherTaskProgressSummarySchema,
    students: zod_1.z.array(exports.teacherTaskStudentProgressSchema),
});
