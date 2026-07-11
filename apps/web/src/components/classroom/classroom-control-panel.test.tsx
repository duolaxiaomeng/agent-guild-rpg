import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ClassroomControlPanel } from "./classroom-control-panel";
import { pauseClassroomStage, startClassroomStage } from "../../lib/api-client";

vi.mock("../../lib/api-client", async () => {
  const actual = await vi.importActual<typeof import("../../lib/api-client")>("../../lib/api-client");
  return { ...actual, pauseClassroomStage: vi.fn(), startClassroomStage: vi.fn() };
});

const snapshot = {
  session: { id: "class-1", courseWorldId: "course-1", dayId: "day-1", status: "live" as const, version: 3, currentStageId: "stage-1", startedAt: "2026-07-12T09:00:00.000Z", endedAt: null },
  currentStage: { id: "stage-1", title: "个人实践", description: "完成今日切片", sortOrder: 0, durationSeconds: 1800, extensionSeconds: 0, status: "running" as const, version: 2, startedAt: "2026-07-12T09:00:00.000Z", pausedAt: null, accumulatedPauseSeconds: 0, remainingSeconds: 1200 },
  stages: [],
  helpRequests: [],
  viewer: { role: "teacher" as const, canControlStages: true, canHandleHelp: true },
  serverNow: "2026-07-12T09:10:00.000Z"
};

describe("ClassroomControlPanel", () => {
  it("renders the active stage and sends a pause with its version", async () => {
    vi.mocked(pauseClassroomStage).mockResolvedValue(snapshot);
    render(<ClassroomControlPanel snapshot={snapshot} token="session_teacher-1" />);

    expect(screen.getByText("个人实践")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "暂停" }));
    await waitFor(() => expect(pauseClassroomStage).toHaveBeenCalledWith("stage-1", 2, "session_teacher-1"));
  });

  it("shows a read-only state for assistants", () => {
    render(<ClassroomControlPanel snapshot={{ ...snapshot, viewer: { role: "assistant", canControlStages: false, canHandleHelp: true } }} token="session_assistant-1" />);
    expect(screen.getByText("助教只读模式")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "暂停" })).toBeDisabled();
  });

  it("shows a refresh hint when a stage update conflicts", async () => {
    vi.mocked(pauseClassroomStage).mockRejectedValue(new Error("Failed to post: 409"));
    render(<ClassroomControlPanel snapshot={snapshot} token="session_teacher-1" />);
    fireEvent.click(screen.getByRole("button", { name: "暂停" }));
    await waitFor(() => expect(screen.getByText("课堂状态已更新，请刷新课堂快照")).toBeInTheDocument());
  });

  it("shows the first draft stage and starts it when currentStage is empty", async () => {
    const draftStage = { ...snapshot.currentStage, id: "stage-draft", title: "讲解", status: "draft" as const, version: 7, startedAt: null, remainingSeconds: null };
    vi.mocked(startClassroomStage).mockResolvedValue({ ...snapshot, currentStage: { ...draftStage, status: "running", startedAt: "2026-07-12T09:00:00.000Z", remainingSeconds: 1800 } });
    render(<ClassroomControlPanel snapshot={{ ...snapshot, currentStage: null, stages: [draftStage] }} token="session_teacher-1" />);

    expect(screen.getByText("讲解")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "开始" }));
    await waitFor(() => expect(startClassroomStage).toHaveBeenCalledWith("stage-draft", 7, "session_teacher-1"));
  });
});
