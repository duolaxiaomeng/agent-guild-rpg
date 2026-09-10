import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  confirmAgentAssignment,
  type AgentAssignmentRun,
} from "../../lib/api-client";
import { StudentAgentAssignments } from "./student-agent-assignments";

vi.mock("../../lib/api-client", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../lib/api-client")>();
  return {
    ...original,
    confirmAgentAssignment: vi.fn(),
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
  result: {
    provider: "codex-cli",
    exitCode: 0,
    output: "Implemented the page. 12 tests passed.",
    outputTruncated: false,
    durationMs: 4200,
  },
  submission: null,
  createdAt: "2026-07-15T01:00:00.000Z",
  updatedAt: "2026-07-15T01:05:00.000Z",
};

describe("StudentAgentAssignments", () => {
  beforeEach(() => {
    vi.mocked(confirmAgentAssignment).mockReset();
  });

  it("shows persisted execution evidence and submits only after student confirmation", async () => {
    vi.mocked(confirmAgentAssignment).mockResolvedValue({
      submission: { id: "submission-1" },
      queue: { jobId: "review-submission-1", status: "queued" },
    });

    render(
      <StudentAgentAssignments
        initialRuns={[completedRun]}
        token="session_student-1"
      />,
    );

    expect(screen.getByText("Implemented the page. 12 tests passed."))
      .toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("学习反思"), {
      target: {
        value: "我检查了 Agent 的真实执行结果，并确认测试结果符合任务要求。",
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "确认提交评审" }));

    await waitFor(() => {
      expect(confirmAgentAssignment).toHaveBeenCalledWith(
        {
          runId: "day-1-student-1-frontend",
          selfReflection:
            "我检查了 Agent 的真实执行结果，并确认测试结果符合任务要求。",
        },
        "session_student-1",
      );
    });
    expect(await screen.findByText("真实执行证据已提交，等待 AI 初评。"))
      .toBeInTheDocument();
    expect(screen.getByText("AI 评审中")).toBeInTheDocument();
  });
});
