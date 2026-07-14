import { describe, expect, it } from "vitest";
import {
  memoryNodeSchema,
  observeRequestSchema,
  reflectRequestSchema,
  retrieveRequestSchema
} from "./memory";

describe("memory contracts", () => {
  it("accepts non-UUID business IDs for optional memory scopes", () => {
    const scope = {
      courseWorldId: "course-world-1",
      roomId: "room-student-1",
      agentSessionId: "session-1",
      taskId: "task-day-1"
    };

    expect(observeRequestSchema.parse({
      studentId: "student-1",
      type: "observation",
      content: "完成了教学任务",
      ...scope
    })).toMatchObject(scope);

    expect(retrieveRequestSchema.parse({
      studentId: "student-1",
      query: "教学任务",
      ...scope
    })).toMatchObject(scope);

    expect(reflectRequestSchema.parse({
      studentId: "student-1",
      ...scope
    })).toMatchObject(scope);
  });

  it("requires memory nodes to expose nullable scope fields", () => {
    expect(memoryNodeSchema.parse({
      id: "memory-1",
      studentId: "student-1",
      type: "observation",
      content: "旧记忆仍然可以返回",
      importance: 5,
      courseWorldId: null,
      roomId: null,
      agentSessionId: null,
      taskId: null,
      createdAt: "2026-07-14T08:00:00.000Z",
      lastAccessedAt: "2026-07-14T08:00:00.000Z"
    })).toMatchObject({ courseWorldId: null, taskId: null });
  });
});
