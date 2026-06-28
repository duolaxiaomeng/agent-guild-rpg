import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { getChatOverview, getQuestList } from "../../lib/api-client";
import ChatPage from "./page";

vi.mock("../../lib/api-client", () => ({
  getChatOverview: vi.fn(),
  getQuestList: vi.fn()
}));

describe("chat page", () => {
  it("renders the personal chat room and day panel from the api", async () => {
    vi.mocked(getChatOverview).mockResolvedValue({
      studentId: "student-1",
      studentName: "Lin",
      agentLabel: "Claude Code",
      sessionStatus: "active",
      sessionSummary: "最近一次对话聚焦 README 打磨与截图整理。",
      latestSubmission: {
        id: "submission-1",
        statusLabel: "待老师审核",
        submittedAt: "2026-06-29T10:00:00.000Z",
        dayLabel: "Day 1"
      },
      collaborationGuests: [
        {
          studentId: "student-2",
          studentName: "Mo",
          contributionLabel: "协作贡献 4"
        },
        {
          studentId: "student-3",
          studentName: "Kai",
          contributionLabel: "协作贡献 2"
        }
      ]
    });
    vi.mocked(getQuestList).mockResolvedValue([
      { id: "day-1", title: "First Agent Session", status: "completed" },
      { id: "day-2", title: "Prompt Iteration", status: "open" },
      { id: "day-3", title: "Peer Review Prep", status: "locked" }
    ]);

    render(await ChatPage());

    expect(screen.getByRole("heading", { name: "个人聊天室" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Day 关卡面板" })).toBeInTheDocument();
    expect(screen.getByText("Lin 的 Agent 工作间")).toBeInTheDocument();
    expect(screen.getByText("当前连接 Agent：")).toBeInTheDocument();
    expect(screen.getByText("Claude Code")).toBeInTheDocument();
    expect(screen.getByText("待老师审核")).toBeInTheDocument();
    expect(screen.getByText("Prompt Iteration")).toBeInTheDocument();
    expect(screen.getByText("已授权协作者：Mo（协作贡献 4）、Kai（协作贡献 2）")).toBeInTheDocument();
    expect(vi.mocked(getChatOverview)).toHaveBeenCalledWith("student-1");
    expect(vi.mocked(getQuestList)).toHaveBeenCalledOnce();
  });
});
