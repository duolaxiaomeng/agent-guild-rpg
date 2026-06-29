import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import HomePage from "./page";

describe("home page", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders the main city heading with live world data", async () => {
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

      if (url.endsWith("/world")) {
        return {
          ok: true,
          json: async () => ({
            currentDay: 1,
            location: "main_city",
            homesteads: [
              {
                ownerId: "student-1",
                displayName: "Lin",
                location: "homestead",
                isOnline: true
              },
              {
                ownerId: "student-2",
                displayName: "Mo",
                location: "homestead",
                isOnline: false
              },
              {
                ownerId: "student-3",
                displayName: "Kai",
                location: "homestead",
                isOnline: true
              }
            ]
          })
        } as Response;
      }

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

    render(await HomePage());

    expect(screen.getByText("主城区")).toBeInTheDocument();
    expect(screen.getByText("第 1 天教学世界")).toBeInTheDocument();
    expect(screen.getByText("在线家园 2 / 3")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText("当前登录：Teacher Lin（老师）")).toBeInTheDocument();
    });
  });

  it("renders a safe fallback state when the world api is unavailable", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("fetch failed"));

    render(await HomePage());

    expect(screen.getByText("主城区")).toBeInTheDocument();
    expect(
      screen.getByText("实时教学 API 暂不可达，主城区已降级为空态展示。")
    ).toBeInTheDocument();
    expect(screen.getByText("第 0 天教学世界")).toBeInTheDocument();
    expect(screen.getByText("在线家园 0 / 0")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText("当前登录：未登录")).toBeInTheDocument();
    });
  });
});
