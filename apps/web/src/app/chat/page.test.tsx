import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ChatPage from "./page";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() })
}));

const getCookie = vi.fn();

vi.mock("next/headers", () => ({
  cookies: () => ({
    get: getCookie
  })
}));

describe("chat page", () => {
  beforeEach(() => {
    window.localStorage.clear();
    getCookie.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders the personal chat room and day panel from the api", async () => {
    getCookie.mockReturnValue({ value: "session_student-2" });
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

      if (url.includes("/chat?roomId=room-chat-student-2")) {
        return {
          ok: true,
          json: async () => ({
            roomId: "room-chat-student-2",
            viewerRole: "owner",
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
            ],
            messages: [
              {
                id: "message-1",
                roomId: "room-chat-student-2",
                authorId: "student-2",
                authorName: "Mo",
                body: "我先把 README 调整一下，再补截图。",
                createdAt: "2026-06-29T10:05:00.000Z"
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

      if (url.endsWith("/classrooms/sessions/active")) {
        return {
          ok: true,
          json: async () => ({
            session: { id: "class-1", courseWorldId: "course-1", dayId: "day-1", status: "live", version: 3, currentStageId: "stage-1", startedAt: "2026-06-29T09:00:00.000Z", endedAt: null },
            currentStage: { id: "stage-1", title: "个人实践", description: "完成今日切片", sortOrder: 0, durationSeconds: 1800, extensionSeconds: 0, status: "running", version: 2, startedAt: "2026-06-29T09:00:00.000Z", pausedAt: null, accumulatedPauseSeconds: 0, remainingSeconds: 1200 },
            stages: [], helpRequests: [], viewer: { role: "student", canControlStages: false, canHandleHelp: false }, serverNow: "2026-06-29T09:10:00.000Z"
          })
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

      if (url.includes("/rooms/accessible-rooms")) {
        return {
          ok: true,
          json: async () => [
            {
              roomId: "room-chat-student-1",
              ownerId: "student-1",
              ownerName: "Lin",
              scope: "chat_summary",
              expiresAt: "2026-06-30T10:00:00.000Z",
              createdAt: "2026-06-29T10:00:00.000Z"
            }
          ]
        } as Response;
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });

    render(await ChatPage({}));

    await waitFor(() => {
      expect(screen.getByText("当前登录：Mo（学生）")).toBeInTheDocument();
    });
    expect(screen.getByRole("heading", { name: "个人聊天室" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "每日关卡" })).toBeInTheDocument();
    expect(screen.getByText("Mo 的 Agent 工作间")).toBeInTheDocument();
    expect(screen.getByText("Claude Code")).toBeInTheDocument();
    expect(screen.getByText("个人实践")).toBeInTheDocument();
    expect(screen.getByText("待老师审核")).toBeInTheDocument();
    expect(screen.getByText("Prompt Iteration")).toBeInTheDocument();
    expect(screen.getByText("授权列表")).toBeInTheDocument();
    expect(screen.getByText("Kai · chat_summary · 生效中")).toBeInTheDocument();
    expect(screen.getByText("我先把 README 调整一下，再补截图。")).toBeInTheDocument();
    expect(fetchSpy).toHaveBeenCalledWith("http://localhost:3001/chat?roomId=room-chat-student-2", expect.objectContaining({
      cache: "no-store",
      headers: {
        Authorization: "Bearer session_student-2"
      }
    }));
    expect(fetchSpy).toHaveBeenCalledWith("http://localhost:3001/auth/session", expect.objectContaining({
      cache: "no-store",
      headers: {
        Authorization: "Bearer session_student-2"
      }
    }));
    expect(fetchSpy).toHaveBeenCalledWith(
      "http://localhost:3001/rooms/access-grants?roomId=room-chat-student-2",
      expect.objectContaining({
        cache: "no-store",
        headers: {
          Authorization: "Bearer session_student-2"
        }
      })
    );
    expect(
      screen.getByRole("link", { name: "进入 Lin 的房间" })
    ).toBeInTheDocument();
  });

  it("renders a granted guest room view without owner grant controls", async () => {
    getCookie.mockReturnValue({ value: "session_student-2" });
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

      if (url.includes("/chat?roomId=room-chat-student-1")) {
        return {
          ok: true,
          json: async () => ({
            roomId: "room-chat-student-1",
            viewerRole: "guest",
            studentId: "student-1",
            studentName: "Lin",
            agentLabel: "Claude Code",
            sessionStatus: "active",
            sessionSummary: "房主正在整理最新提交摘要。",
            latestSubmission: {
              id: "submission-2",
              statusLabel: "待老师审核",
              submittedAt: "2026-06-29T11:00:00.000Z",
              dayLabel: "Day 1"
            },
            collaborationGuests: [],
            messages: [
              {
                id: "message-2",
                roomId: "room-chat-student-1",
                authorId: "student-1",
                authorName: "Lin",
                body: "欢迎进来一起看这次修改记录。",
                createdAt: "2026-06-29T11:05:00.000Z"
              }
            ]
          })
        } as Response;
      }

      if (url.endsWith("/quests")) {
        return {
          ok: true,
          json: async () => [
            { id: "day-1", title: "First Agent Session", status: "open" },
            { id: "day-2", title: "Prompt Iteration", status: "locked" }
          ]
        } as Response;
      }

      if (url.endsWith("/classrooms/sessions/active")) {
        return {
          ok: true,
          json: async () => ({
            session: { id: "class-1", courseWorldId: "course-1", dayId: "day-1", status: "live", version: 3, currentStageId: "stage-1", startedAt: "2026-06-29T09:00:00.000Z", endedAt: null },
            currentStage: { id: "stage-1", title: "个人实践", description: "完成今日切片", sortOrder: 0, durationSeconds: 1800, extensionSeconds: 0, status: "paused", version: 2, startedAt: "2026-06-29T09:00:00.000Z", pausedAt: "2026-06-29T09:05:00.000Z", accumulatedPauseSeconds: 0, remainingSeconds: 1200 },
            stages: [], helpRequests: [], viewer: { role: "student", canControlStages: false, canHandleHelp: false }, serverNow: "2026-06-29T09:10:00.000Z"
          })
        } as Response;
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });

    render(await ChatPage({
      searchParams: Promise.resolve({ roomId: "room-chat-student-1" })
    }));

    await waitFor(() => {
      expect(screen.getByText("当前登录：Mo（学生）")).toBeInTheDocument();
    });
    expect(screen.getByRole("heading", { name: "协作聊天室" })).toBeInTheDocument();
    expect(screen.getByText("Lin 的协作房间")).toBeInTheDocument();
    expect(screen.getByText("欢迎进来一起看这次修改记录。")).toBeInTheDocument();
    expect(screen.queryByText("授权列表")).not.toBeInTheDocument();
    expect(fetchSpy).toHaveBeenCalledWith(
      "http://localhost:3001/chat?roomId=room-chat-student-1",
      expect.objectContaining({
        cache: "no-store",
        headers: {
          Authorization: "Bearer session_student-2"
        }
      })
    );
  });

  it("asks unauthenticated visitors to log in before entering the personal chat room", async () => {
    getCookie.mockReturnValue(undefined);

    render(await ChatPage({}));

    expect(screen.getByRole("heading", { name: "个人聊天室" })).toBeInTheDocument();
    expect(screen.getByText("请先登录学生账号。")).toBeInTheDocument();
  });

  it("renders a read-only chat room for a teacher observing a student room", async () => {
    getCookie.mockReturnValue({ value: "session_teacher-1" });
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

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
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

      if (url.includes("/chat?roomId=room-chat-student-1")) {
        return {
          ok: true,
          json: async () => ({
            roomId: "room-chat-student-1",
            viewerRole: "teacher",
            studentId: "student-1",
            studentName: "Lin",
            agentLabel: "Claude Code",
            sessionStatus: "active",
            sessionSummary: "学生正在整理 README 与截图。",
            latestSubmission: {
              id: "submission-1",
              statusLabel: "待老师审核",
              submittedAt: "2026-06-29T10:00:00.000Z",
              dayLabel: "Day 1"
            },
            collaborationGuests: [],
            messages: [
              {
                id: "message-1",
                roomId: "room-chat-student-1",
                authorId: "student-1",
                authorName: "Lin",
                body: "我先把 README 修正完，再补截图。",
                createdAt: "2026-06-29T10:05:00.000Z"
              }
            ]
          })
        } as Response;
      }

      if (url.endsWith("/quests")) {
        return {
          ok: true,
          json: async () => [
            { id: "day-1", title: "First Agent Session", status: "open" }
          ]
        } as Response;
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });

    render(await ChatPage({
      searchParams: Promise.resolve({ roomId: "room-chat-student-1" })
    }));

    await waitFor(() => {
      expect(screen.getByText("当前登录：Teacher Lin（老师）")).toBeInTheDocument();
    });
    expect(screen.getByRole("heading", { name: "Teacher 观察" })).toBeInTheDocument();
    expect(screen.getByText("我先把 README 修正完，再补截图。")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "今日提交" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "发送消息" })).not.toBeInTheDocument();
    expect(screen.queryByText("授权列表")).not.toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalledWith(
      "http://localhost:3001/rooms/access-grants?roomId=room-chat-student-1",
      expect.anything()
    );
    expect(fetchSpy).not.toHaveBeenCalledWith(
      "http://localhost:3001/rooms/accessible-rooms",
      expect.anything()
    );
  });

  it("asks a teacher without a roomId to pick a student room from the teacher console", async () => {
    getCookie.mockReturnValue({ value: "session_teacher-1" });
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

      throw new Error(`Unexpected fetch: ${url}`);
    });

    render(await ChatPage({}));

    expect(screen.getByRole("heading", { name: "Teacher 观察" })).toBeInTheDocument();
    expect(screen.getByText("请从教师工作台选择学生房间。")).toBeInTheDocument();
  });

  it("keeps the teacher in a read-only view when the chat api is unreachable", async () => {
    getCookie.mockReturnValue({ value: "session_teacher-1" });
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

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
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

      throw new TypeError("fetch failed");
    });

    render(await ChatPage({
      searchParams: Promise.resolve({ roomId: "room-chat-student-1" })
    }));

    await waitFor(() => {
      expect(screen.getByText("当前登录：Teacher Lin（老师）")).toBeInTheDocument();
    });
    expect(screen.getByRole("heading", { name: "Teacher 观察" })).toBeInTheDocument();
    expect(
      screen.getByText("聊天、授权与关卡数据暂不可达，当前显示安全空态。")
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "今日提交" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "发送消息" })).not.toBeInTheDocument();
    expect(screen.queryByText("授权列表")).not.toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalledWith(
      "http://localhost:3001/rooms/access-grants?roomId=room-chat-student-1",
      expect.anything()
    );
    expect(fetchSpy).not.toHaveBeenCalledWith(
      "http://localhost:3001/rooms/accessible-rooms",
      expect.anything()
    );
  });
});
