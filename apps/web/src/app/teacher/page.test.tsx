import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { getQuestListSafe, getReviewQueueSafe } from "../../lib/api-client";
import TeacherPage from "./page";

vi.mock("../../lib/api-client", () => ({
  getQuestListSafe: vi.fn(),
  getReviewQueueSafe: vi.fn()
}));

describe("teacher page", () => {
  it("renders the teacher workbench from live quests and reviews", async () => {
    vi.mocked(getQuestListSafe).mockResolvedValue({
      degraded: false,
      data: [
        { id: "day-1", title: "First Agent Session", status: "completed" },
        { id: "day-2", title: "Prompt Iteration", status: "open" },
        { id: "day-3", title: "Peer Review Prep", status: "locked" }
      ]
    });
    vi.mocked(getReviewQueueSafe).mockResolvedValue({
      degraded: false,
      data: {
        summary: {
          pendingCount: 1,
          reviewedToday: 1,
          flaggedCount: 1
        },
        items: [
          {
            submissionId: "submission-2",
            studentName: "Mo",
            guildName: "Morning Forge",
            suggestedScore: 85,
            finalScore: 90,
            decision: "adjust",
            rationale: "补充过程截图后再通过。",
            dayLabel: "Day 2",
            submittedAt: "2026-06-29T09:00:00.000Z"
          }
        ]
      },
    });

    render(await TeacherPage());

    expect(screen.getByRole("heading", { name: "老师工作台" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Day 关卡面板" })).toBeInTheDocument();
    expect(screen.getByText("待老师裁定 1")).toBeInTheDocument();
    expect(screen.getByText("今日已裁定 1")).toBeInTheDocument();
    expect(screen.getByText("需重点关注 1")).toBeInTheDocument();
    expect(screen.getByText("Mo")).toBeInTheDocument();
    expect(screen.getByText("Morning Forge")).toBeInTheDocument();
    expect(screen.getByText("需要调整")).toBeInTheDocument();
    expect(screen.getByText("终评分 90")).toBeInTheDocument();
    expect(screen.getAllByText("Day 2")).toHaveLength(2);
    expect(screen.getByText("Prompt Iteration")).toBeInTheDocument();
    expect(vi.mocked(getQuestListSafe)).toHaveBeenCalledOnce();
    expect(vi.mocked(getReviewQueueSafe)).toHaveBeenCalledOnce();
  });

  it("renders a safe fallback state when the teacher apis are unavailable", async () => {
    vi.mocked(getQuestListSafe).mockResolvedValue({
      degraded: true,
      data: []
    });
    vi.mocked(getReviewQueueSafe).mockResolvedValue({
      degraded: true,
      data: {
        summary: {
          pendingCount: 0,
          reviewedToday: 0,
          flaggedCount: 0
        },
        items: []
      }
    });

    render(await TeacherPage());

    expect(screen.getByRole("heading", { name: "老师工作台" })).toBeInTheDocument();
    expect(
      screen.getByText("评审与关卡数据暂不可达，当前显示安全空态。")
    ).toBeInTheDocument();
    expect(screen.getByText("待老师裁定 0")).toBeInTheDocument();
    expect(screen.getByText("今日已裁定 0")).toBeInTheDocument();
  });
});
