import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import TeacherPage from "./page";

describe("teacher page", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders the teacher workbench from live quests and reviews", async () => {
    window.localStorage.setItem(
      "agent-guild-session",
      JSON.stringify({
        token: "session_teacher-1",
        user: {
          id: "teacher-1",
          role: "teacher",
          displayName: "Teacher Lin"
        }
      })
    );

    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);

      if (url.endsWith("/auth/session")) {
        return {
          ok: true,
          json: async () => ({
            token: "session_teacher-1",
            user: {
              id: "teacher-1",
              role: "teacher",
              displayName: "Teacher Lin"
            }
          })
        } as Response;
      }

      if (url.endsWith("/quests")) {
        return {
          ok: true,
          json: async () => [
            { id: "day-1", title: "First Agent Session", status: "completed" },
            { id: "day-2", title: "Prompt Iteration", status: "open" },
            { id: "day-3", title: "Peer Review Prep", status: "locked" }
          ]
        } as Response;
      }

      if (url.endsWith("/reviews")) {
        return {
          ok: true,
          json: async () => ({
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
          })
        } as Response;
      }

      throw new Error(`Unexpected fetch: ${url}`);
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
    await waitFor(() => {
      expect(screen.getByText("当前登录：Teacher Lin（老师）")).toBeInTheDocument();
    });
  });

  it("renders a safe fallback state when the teacher apis are unavailable", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("fetch failed"));

    render(await TeacherPage());

    expect(screen.getByRole("heading", { name: "老师工作台" })).toBeInTheDocument();
    expect(
      screen.getByText("评审与关卡数据暂不可达，当前显示安全空态。")
    ).toBeInTheDocument();
    expect(screen.getByText("待老师裁定 0")).toBeInTheDocument();
    expect(screen.getByText("今日已裁定 0")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText("当前登录：未登录")).toBeInTheDocument();
    });
  });
});
