import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { StudentClassroomBanner } from "./student-classroom-banner";
import { createHelpRequest } from "../../lib/api-client";

vi.mock("../../lib/api-client", async () => {
  const actual = await vi.importActual<typeof import("../../lib/api-client")>("../../lib/api-client");
  return { ...actual, createHelpRequest: vi.fn() };
});

const snapshot = {
  session: { id: "class-1", courseWorldId: "course-1", dayId: "day-1", status: "live" as const, version: 3, currentStageId: "stage-1", startedAt: "2026-07-12T09:00:00.000Z", endedAt: null },
  currentStage: { id: "stage-1", title: "个人实践", description: "完成今日切片", sortOrder: 0, durationSeconds: 1800, extensionSeconds: 0, status: "running" as const, version: 2, startedAt: "2026-07-12T09:00:00.000Z", pausedAt: null, accumulatedPauseSeconds: 0, remainingSeconds: 1200 },
  stages: [],
  helpRequests: [],
  viewer: { role: "student" as const, canControlStages: false, canHandleHelp: false },
  serverNow: "2026-07-12T09:10:00.000Z"
};

describe("StudentClassroomBanner", () => {
  it("renders the running stage and countdown", () => {
    render(<StudentClassroomBanner snapshot={snapshot} token="session_student-1" studentId="student-1" />);
    expect(screen.getByText("个人实践")).toBeInTheDocument();
    expect(screen.getByText(/剩余/)).toBeInTheDocument();
  });

  it("shows paused state and lets a student raise a help request", async () => {
    vi.mocked(createHelpRequest).mockResolvedValue({
      id: "help-1", sessionId: "class-1", studentId: "student-1", category: "question", message: "我不知道下一步怎么做", status: "open", assigneeId: null, resolutionNote: null, createdAt: "2026-07-12T09:10:00.000Z", claimedAt: null, resolvedAt: null, version: 1
    });
    render(<StudentClassroomBanner snapshot={{ ...snapshot, currentStage: { ...snapshot.currentStage, status: "paused" as const } }} token="session_student-1" studentId="student-1" />);
    expect(screen.getByText("已暂停")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "举手求助" }));
    fireEvent.change(screen.getByLabelText("问题描述"), { target: { value: "我不知道下一步怎么做" } });
    fireEvent.click(screen.getByRole("button", { name: "提交求助" }));
    await waitFor(() => expect(createHelpRequest).toHaveBeenCalledWith({ sessionId: "class-1", category: "question", message: "我不知道下一步怎么做" }, "session_student-1"));
    expect(screen.getByText("求助已提交")).toBeInTheDocument();
  });

  it("shows a visible safe empty state when classroom data is unavailable", () => {
    render(<StudentClassroomBanner snapshot={{ ...snapshot, session: { ...snapshot.session, id: "" }, currentStage: null }} token="session_student-1" studentId="student-1" />);
    expect(screen.getByText("课堂数据暂不可达，当前显示安全空态。")).toBeInTheDocument();
  });

  it("shows an error when raising a hand fails", async () => {
    vi.mocked(createHelpRequest).mockRejectedValue(new Error("offline"));
    render(<StudentClassroomBanner snapshot={snapshot} token="session_student-1" studentId="student-1" />);
    fireEvent.click(screen.getByRole("button", { name: "举手求助" }));
    fireEvent.change(screen.getByLabelText("问题描述"), { target: { value: "卡住了" } });
    fireEvent.click(screen.getByRole("button", { name: "提交求助" }));
    await waitFor(() => expect(screen.getByText("求助提交失败，请稍后重试。")).toBeInTheDocument());
  });
});
