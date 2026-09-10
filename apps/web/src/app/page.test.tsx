import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import HomePage from "./page";

const getServerSessionMock = vi.hoisted(() => vi.fn());

// Server Components cannot call `next/headers` without a request context in
// jsdom. Keep the page test focused on its rendered contract by supplying the
// server-session boundary explicitly.
vi.mock("../lib/server-session", () => ({
  getServerSession: getServerSessionMock
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() })
}));

describe("home page", () => {
  beforeEach(() => {
    window.localStorage.clear();
    getServerSessionMock.mockResolvedValue({ status: "unauthenticated" });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders the main city heading with live world data", async () => {
    getServerSessionMock.mockResolvedValue({
      status: "authenticated",
      session: {
        token: "session_teacher-1",
        user: { id: "teacher-1", role: "teacher", displayName: "Teacher Lin" }
      }
    });
    window.localStorage.setItem(
      "agent-guild-session",
      JSON.stringify({
        token: "session_teacher-1",
        user: {
          id: "teacher-1",
          role: "teacher",
          displayName: "Teacher Lin",
        },
      }),
    );

    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);

      if (url.endsWith("/world")) {
        return {
          ok: true,
          json: async () => ({
            currentDay: 1,
            location: "main_city",
            homesteads: [
              { ownerId: "student-1", displayName: "Lin", location: "homestead", isOnline: true },
              { ownerId: "student-2", displayName: "Mo", location: "homestead", isOnline: false },
              { ownerId: "student-3", displayName: "Kai", location: "homestead", isOnline: true },
            ],
          }),
        } as Response;
      }

      if (url.endsWith("/auth/session")) {
        return {
          ok: true,
          json: async () => ({
            token: "session_teacher-1",
            user: { id: "teacher-1", role: "teacher", displayName: "Teacher Lin" },
          }),
        } as Response;
      }

      throw new Error("Unexpected fetch: " + url);
    });

    render(await HomePage({}));

    expect(screen.getByRole("heading", { name: /主城区/ })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Day 网站主题抽奖" })).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText("当前登录：Teacher Lin（老师）")).toBeInTheDocument();
    });
  });

  it("renders a safe fallback state when the world api is unavailable", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("fetch failed"));

    render(await HomePage({}));

    expect(screen.getByRole("heading", { name: /主城区/ })).toBeInTheDocument();
    expect(
      screen.getByText("实时教学 API 暂不可达，主城区已降级为空态展示。"),
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText("当前登录：未登录")).toBeInTheDocument();
    });
  });

  it("lets the user collapse and reopen the mission rail", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("fetch failed"));

    render(await HomePage({}));

    const rail = screen.getByRole("group", { name: "今日任务概览" });
    const toggle = screen.getByRole("button", { name: /第 1 天行动/ });

    expect(rail).toHaveAttribute("open");
    fireEvent.click(toggle);
    expect(rail).not.toHaveAttribute("open");
    fireEvent.click(toggle);
    expect(rail).toHaveAttribute("open");
  });

  it("shows the classroom status banner for a logged-in student", async () => {
    getServerSessionMock.mockResolvedValue({
      status: "authenticated",
      session: {
        token: "session_student-1",
        user: { id: "student-1", role: "student", displayName: "Lin" }
      }
    });
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith("/auth/session")) {
        return { ok: true, json: async () => ({ token: "session_student-1", user: { id: "student-1", role: "student", displayName: "Lin" } }) } as Response;
      }
      if (url.endsWith("/world")) {
        return { ok: true, json: async () => ({ currentDay: 1, location: "main_city", homesteads: [] }) } as Response;
      }
      if (url.endsWith("/classrooms/sessions/active")) {
        return {
          ok: true,
          json: async () => ({
            session: { id: "class-1", courseWorldId: "course-1", dayId: "day-1", status: "live", version: 1, currentStageId: "stage-1", startedAt: null, endedAt: null },
            currentStage: { id: "stage-1", title: "讲解", description: "今日目标", sortOrder: 0, durationSeconds: 600, extensionSeconds: 0, status: "draft", version: 0, startedAt: null, pausedAt: null, accumulatedPauseSeconds: 0, remainingSeconds: null },
            stages: [], helpRequests: [], viewer: { role: "student", canControlStages: false, canHandleHelp: false }, serverNow: new Date().toISOString()
          })
        } as Response;
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    render(await HomePage({}));

    expect(screen.getByRole("region", { name: "学生课堂状态" })).toBeInTheDocument();
    expect(screen.getByText("讲解")).toBeInTheDocument();
  });
});
