import { describe, expect, it } from "vitest";
import {
  createTeacherTaskInputSchema,
  teacherTaskProgressPayloadSchema,
  teacherTaskSchema,
} from "./teacher-task";

const publishedTask = {
  courseWorldId: "course-world-1",
  dayId: "day-1",
  title: "首次 Agent 协作",
  status: "open" as const,
  description: "学习如何把教学目标拆成可交付的 Agent 任务。",
  homework: "连接自己的 Agent，完成一次任务执行并提交过程记录。",
  acceptanceCriteria: [
    "Agent 能读取任务上下文",
    "提交中包含产物链接与复盘",
  ],
  dueAt: "2026-07-15T10:00:00.000Z",
  publishedAt: "2026-07-14T01:00:00.000Z",
  teacherId: "teacher-1",
};

describe("teacher task contracts", () => {
  it("accepts a published daily homework task", () => {
    expect(teacherTaskSchema.parse(publishedTask)).toEqual(publishedTask);
  });

  it("accepts the teacher task creation input", () => {
    const { teacherId: _teacherId, ...input } = publishedTask;

    expect(createTeacherTaskInputSchema.parse(input)).toEqual(input);
  });

  it("accepts per-student task progress with an aggregate summary", () => {
    const payload = {
      ...publishedTask,
      summary: {
        total: 3,
        notStarted: 1,
        submitted: 1,
        reviewed: 1,
      },
      students: [
        {
          studentId: "student-1",
          displayName: "Lin",
          status: "reviewed",
          submissionId: "sub-1",
          submittedAt: "2026-07-14T02:00:00.000Z",
          reviewedAt: "2026-07-14T03:00:00.000Z",
        },
        {
          studentId: "student-2",
          displayName: "Mo",
          status: "submitted",
          submissionId: "sub-2",
          submittedAt: "2026-07-14T02:30:00.000Z",
          reviewedAt: null,
        },
        {
          studentId: "student-3",
          displayName: "Kai",
          status: "not_started",
          submissionId: null,
          submittedAt: null,
          reviewedAt: null,
        },
      ],
    };

    expect(teacherTaskProgressPayloadSchema.parse(payload)).toEqual(payload);
  });

  it("rejects a task without acceptance criteria", () => {
    expect(() => teacherTaskSchema.parse({
      ...publishedTask,
      acceptanceCriteria: [],
    })).toThrow();
  });
});
