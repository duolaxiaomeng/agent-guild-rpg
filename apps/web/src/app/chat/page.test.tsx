import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ChatPage from "./page";

describe("chat page", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders the personal chat room and day panel from the api", async () => {
    window.localStorage.setItem(
      "agent-guild-session",
      JSON.stringify({
        token: "session_student-2",
        user: {
          id: "student-2",
          role: "student",
          displayName: "Mo"
        }
      })
    );

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);

      if (url.endsWith("/auth/session")) {
        return {
          ok: true,
          json: async () => ({
            token: "session_student-2",
            user: {
              id: "student-2",
              role: "student",
              displayName: "Mo"
            }
          })
        } as Response;
      }

      if (url.includes("/chat?studentId=student-2")) {
        return {
          ok: true,
          json: async () => ({
            studentId: "student-2",
            studentName: "Mo",
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
                studentId: "student-3",
                studentName: "Kai",
                contributionLabel: "协作贡献 2"
              }
            ]
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

      if (url.includes("/rooms/access-grants?roomId=room-chat-student-2")) {
        return {
          ok: true,
          json: async () => [
            {
              id: "grant-1",
              roomId: "room-chat-student-2",
              granteeId: "student-3",
              granteeName: "Kai",
              scope: "chat_summary",
              status: "approved",
              createdAt: "2026-06-29T10:00:00.000Z",
              expiresAt: "2026-06-30T10:00:00.000Z"
            }
          ]
        } as Response;
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });

    render(await ChatPage());

    await waitFor(() => {
      expect(screen.getByText("当前登录：Mo（学生）")).toBeInTheDocument();
    });
    expect(screen.getByRole("heading", { name: "个人聊天室" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Day 关卡面板" })).toBeInTheDocument();
    expect(screen.getByText("Mo 的 Agent 工作间")).toBeInTheDocument();
    expect(screen.getByText("Claude Code")).toBeInTheDocument();
    expect(screen.getByText("待老师审核")).toBeInTheDocument();
    expect(screen.getByText("Prompt Iteration")).toBeInTheDocument();
    expect(screen.getByText("授权列表")).toBeInTheDocument();
    expect(screen.getByText("Kai · chat_summary · 生效中")).toBeInTheDocument();
    expect(fetchSpy).toHaveBeenCalledWith("http://localhost:3001/auth/session", {
      cache: "no-store",
      headers: {
        Authorization: "Bearer session_student-2"
      }
    });
    expect(fetchSpy).toHaveBeenCalledWith(
      "http://localhost:3001/chat?studentId=student-2",
      {
        cache: "no-store"
      }
    );
    expect(fetchSpy).toHaveBeenCalledWith(
      "http://localhost:3001/rooms/access-grants?roomId=room-chat-student-2",
      {
        cache: "no-store"
      }
    );
  });

  it("renders a safe fallback state when the chat apis are unavailable", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("fetch failed"));

    render(await ChatPage());

    expect(screen.getByRole("heading", { name: "个人聊天室" })).toBeInTheDocument();
    expect(
      screen.getByText("聊天、授权与关卡数据暂不可达，当前显示安全空态。")
    ).toBeInTheDocument();
    expect(screen.getByText("当前学生 的 Agent 工作间")).toBeInTheDocument();
    expect(screen.getByText("Agent 暂不可用")).toBeInTheDocument();
    expect(screen.getByText("今日未提交")).toBeInTheDocument();
    expect(screen.getByText("暂无授权记录。")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText("当前登录：未登录")).toBeInTheDocument();
    });
  });
});
