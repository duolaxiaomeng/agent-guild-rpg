import { describe, expect, it } from "vitest";
import {
  agentCapabilitySchema,
  agentHandoffSchema,
  agentRoleSchema,
  agentRunSummarySchema,
  agentTeamBindingSchema,
  agentTeamStatusSchema,
  agentTaskSchema,
} from "./agent-team";

describe("agent team contracts", () => {
  it("accepts legacy and extended agent roles", () => {
    const roles = [
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
    ];

    for (const role of roles) {
      expect(agentRoleSchema.parse(role)).toBe(role);
    }
  });

  it("accepts a task assignment with capability tags and lifecycle state", () => {
    expect(agentTaskSchema.parse({
      id: "task-42",
      title: "验证提交的边界条件",
      description: "检查异常输入和失败恢复路径",
      role: "qa",
      capabilities: ["testing", "debugging"],
      status: "in_progress",
      priority: "high",
      assigneeId: "agent-qa-1",
      createdAt: "2026-07-12T09:00:00.000Z",
      startedAt: "2026-07-12T09:05:00.000Z",
    })).toMatchObject({
      role: "qa",
      capabilities: ["testing", "debugging"],
      status: "in_progress",
    });
  });

  it("accepts a persisted visual identity binding", () => {
    expect(agentTeamBindingSchema.parse({
      studentId: "student-1",
      roleKey: "frontend-developer",
      visualRole: "coder",
      updatedAt: "2026-07-15T09:00:00.000Z",
    })).toMatchObject({ roleKey: "frontend-developer", visualRole: "coder" });
  });

  it("rejects unknown roles and capability tags", () => {
    expect(() => agentRoleSchema.parse("unknown-role")).toThrow();
    expect(() => agentCapabilitySchema.parse("unknown-capability")).toThrow();
  });

  it("accepts a concurrent run summary", () => {
    expect(agentRunSummarySchema.parse({
      runId: "run-2026-07-12-01",
      status: "running",
      totalTasks: 8,
      queuedTasks: 2,
      activeTasks: 3,
      completedTasks: 2,
      failedTasks: 1,
      maxConcurrency: 4,
      startedAt: "2026-07-12T09:00:00.000Z",
      updatedAt: "2026-07-12T09:10:00.000Z",
    })).toMatchObject({
      status: "running",
      totalTasks: 8,
      activeTasks: 3,
      maxConcurrency: 4,
    });
  });

  it("accepts a handoff between agents", () => {
    expect(agentHandoffSchema.parse({
      id: "handoff-1",
      taskId: "task-42",
      fromRole: "qa",
      toRole: "reviewer",
      summary: "发现异常输入未覆盖，需要评审确认是否阻断发布",
      completedWork: ["补充空输入测试", "记录失败响应"],
      nextActions: ["确认风险等级", "决定是否创建修复任务"],
      artifacts: [{ kind: "test-report", uri: "https://example.com/report" }],
      blockers: ["等待产品规则确认"],
      createdAt: "2026-07-12T09:15:00.000Z",
    })).toMatchObject({
      taskId: "task-42",
      fromRole: "qa",
      toRole: "reviewer",
    });
  });

  it("rejects invalid counts and malformed handoffs", () => {
    expect(() => agentRunSummarySchema.parse({
      runId: "run-1",
      status: "running",
      totalTasks: 1,
      queuedTasks: 0,
      activeTasks: 2,
      completedTasks: 0,
      failedTasks: 0,
      maxConcurrency: 1,
      startedAt: "2026-07-12T09:00:00.000Z",
      updatedAt: "2026-07-12T09:00:00.000Z",
    })).toThrow();

    expect(() => agentHandoffSchema.parse({
      id: "handoff-1",
      taskId: "task-42",
      fromRole: "qa",
      toRole: "reviewer",
      summary: "",
      completedWork: [],
      nextActions: [],
      artifacts: [],
      blockers: [],
      createdAt: "not-a-date",
    })).toThrow();
  });

  it("exposes the status lifecycle used by the team", () => {
    expect(agentTeamStatusSchema.options).toEqual([
      "queued",
      "assigned",
      "in_progress",
      "blocked",
      "completed",
      "failed",
      "cancelled",
    ]);
  });
});
