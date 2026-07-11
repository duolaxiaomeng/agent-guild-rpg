import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import TeacherPage from "./page";

const getCookie = vi.fn();

vi.mock("next/headers", () => ({
  cookies: () => ({
    get: getCookie
  })
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() })
}));

describe("teacher page", () => {
  beforeEach(() => {
    window.localStorage.clear();
    getCookie.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders the teacher workbench from live quests and reviews", async () => {
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
                reviewStatus: "teacher_decided",
                suggestedScore: 85,
                finalScore: 90,
                decision: "adjust",
                isPendingTeacherDecision: false,
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
    expect(screen.getByRole("heading", { name: "每日关卡" })).toBeInTheDocument();
    expect(screen.getByText("待老师裁定 1")).toBeInTheDocument();
    expect(screen.getByText("今日已裁定 1")).toBeInTheDocument();
    expect(screen.getByText("需重点关注 1")).toBeInTheDocument();
    expect(screen.getByText("Mo")).toBeInTheDocument();
    expect(screen.getByText("Morning Forge")).toBeInTheDocument();
    expect(screen.getByText("需要调整")).toBeInTheDocument();
    expect(screen.getByText("终评分 90")).toBeInTheDocument();
    expect(screen.getAllByText("Day 2")).toHaveLength(1);
    expect(screen.getByText("Prompt Iteration")).toBeInTheDocument();
    expect(globalThis.fetch).toHaveBeenCalledWith("http://localhost:3001/reviews", expect.objectContaining({
      cache: "no-store",
      headers: {
        Authorization: "Bearer session_teacher-1"
      }
    }));
    await waitFor(() => {
      expect(screen.getByText("当前登录：Teacher Lin（老师）")).toBeInTheDocument();
    });
  });

  it("asks unauthenticated visitors to log in before entering the teacher workbench", async () => {
    getCookie.mockReturnValue(undefined);

    render(await TeacherPage());

    expect(screen.getByRole("heading", { name: "老师工作台" })).toBeInTheDocument();
    expect(screen.getByText("请先登录老师账号。")).toBeInTheDocument();
  });

  it("blocks students from entering the teacher workbench", async () => {
    getCookie.mockReturnValue({ value: "session_student-1" });
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);

      if (url.endsWith("/auth/session")) {
        return {
          ok: true,
          json: async () => ({
            token: "session_student-1",
            user: {
              id: "student-1",
              role: "student",
              displayName: "Lin"
            }
          })
        } as Response;
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });

    render(await TeacherPage());

    expect(screen.getByRole("heading", { name: "老师工作台" })).toBeInTheDocument();
    expect(screen.getByText("当前账号无权进入老师工作台。")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText("当前登录：未登录")).toBeInTheDocument();
    });
  });

  it("lets an assigned assistant enter and shows only the help queue", async () => {
    getCookie.mockReturnValue({ value: "session_assistant-1" });
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith("/auth/session")) {
        return { ok: true, json: async () => ({ token: "session_assistant-1", user: { id: "student-2", role: "student", displayName: "Kai" } }) } as Response;
      }
      if (url.endsWith("/classrooms/sessions/active")) {
        return { ok: true, json: async () => ({
          session: { id: "class-1", courseWorldId: "course-1", dayId: "day-1", status: "live", version: 1, currentStageId: null, startedAt: null, endedAt: null },
          currentStage: null, stages: [], helpRequests: [],
          viewer: { role: "assistant", canControlStages: false, canHandleHelp: true },
          serverNow: "2026-07-12T09:00:00.000Z"
        }) } as Response;
      }
      if (url.endsWith("/classrooms/sessions/class-1/help-requests")) return { ok: true, json: async () => [] } as Response;
      if (url.endsWith("/quests")) return { ok: true, json: async () => [] } as Response;
      if (url.endsWith("/reviews")) return { ok: true, json: async () => ({ summary: { pendingCount: 0, reviewedToday: 0, flaggedCount: 0 }, items: [] }) } as Response;
      if (url.endsWith("/agent-avatars")) return { ok: true, json: async () => [] } as Response;
      throw new Error(`Unexpected fetch: ${url}`);
    });

    render(await TeacherPage());

    expect(screen.getByRole("heading", { name: "老师工作台" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "课堂求助队列" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "课堂指挥台" })).not.toBeInTheDocument();
  });
});
