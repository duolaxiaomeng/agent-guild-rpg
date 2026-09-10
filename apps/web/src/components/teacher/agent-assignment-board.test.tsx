import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createAgentAssignment,
  getAgentAssignments,
  type AgentAssignmentRun,
} from "../../lib/api-client";
import { AgentAssignmentBoard } from "./agent-assignment-board";

vi.mock("../../lib/api-client", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../lib/api-client")>();
  return {
    ...original,
    createAgentAssignment: vi.fn(),
    getAgentAssignments: vi.fn(),
  };
});

const completedRun: AgentAssignmentRun = {
  id: "task-1",
  runId: "day-1-student-1-frontend",
  studentId: "student-1",
  courseWorldId: "course-world-1",
  dayId: "day-1",
  guildId: null,
  provider: "codex-cli",
  input: { instruction: "实现学生首页并运行测试" },
  dependencies: [],
  requiredCapabilities: ["provider-process"],
  priority: 0,
  resourceClass: "heavy",
  status: "completed",
  attemptCount: 1,
  maxAttempts: 3,
  blockedByCount: 0,
  failureReason: null,
  result: { exitCode: 0, output: "12 tests passed" },
  submission: null,
  createdAt: "2026-07-15T01:00:00.000Z",
  updatedAt: "2026-07-15T01:05:00.000Z",
};

describe("AgentAssignmentBoard", () => {
  beforeEach(() => {
    vi.mocked(createAgentAssignment).mockReset();
    vi.mocked(getAgentAssignments).mockReset();
  });

  it("dispatches a scoped task to a student Agent and refreshes the real run list", async () => {
    vi.mocked(createAgentAssignment).mockResolvedValue(completedRun);
    vi.mocked(getAgentAssignments).mockResolvedValue([completedRun]);

    render(
      <AgentAssignmentBoard
        initialRuns={[]}
        students={[{ id: "student-1", displayName: "Lin" }]}
        courseWorldId="course-world-1"
        defaultDayId="day-1"
        token="session_teacher-1"
      />,
    );

    fireEvent.change(screen.getByLabelText("派发学生"), {
      target: { value: "student-1" },
    });
    fireEvent.change(screen.getByLabelText("Agent 执行指令"), {
      target: { value: "实现学生首页并运行测试" },
    });
    fireEvent.click(screen.getByRole("button", { name: "派发给学生 Agent" }));

    await waitFor(() => {
      expect(createAgentAssignment).toHaveBeenCalledWith(
        expect.objectContaining({
          runId: expect.stringMatching(/^day-1-student-1-/),
          studentId: "student-1",
          provider: "codex-cli",
          input: { instruction: "实现学生首页并运行测试" },
          courseWorldId: "course-world-1",
          dayId: "day-1",
          requiredCapabilities: ["provider-process"],
          resourceClass: "heavy",
          maxAttempts: 3,
        }),
        "session_teacher-1",
      );
    });
    expect(getAgentAssignments).toHaveBeenCalledWith("session_teacher-1");
    expect(await screen.findByText("任务已派发，等待学生 Connector 领取。"))
      .toBeInTheDocument();
    expect(screen.getByText("12 tests passed")).toBeInTheDocument();
  });
});
