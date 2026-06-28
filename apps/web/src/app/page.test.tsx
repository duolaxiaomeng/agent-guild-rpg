import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { getWorldPayloadSafe } from "../lib/api-client";
import HomePage from "./page";

vi.mock("../lib/api-client", () => ({
  getWorldPayloadSafe: vi.fn()
}));

describe("home page", () => {
  it("renders the main city heading with live world data", async () => {
    vi.mocked(getWorldPayloadSafe).mockResolvedValue({
      degraded: false,
      data: {
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
      }
    });

    render(await HomePage());

    expect(screen.getByText("主城区")).toBeInTheDocument();
    expect(screen.getByText("第 1 天教学世界")).toBeInTheDocument();
    expect(screen.getByText("在线家园 2 / 3")).toBeInTheDocument();
  });

  it("renders a safe fallback state when the world api is unavailable", async () => {
    vi.mocked(getWorldPayloadSafe).mockResolvedValue({
      degraded: true,
      data: {
        currentDay: 0,
        location: "offline",
        homesteads: []
      }
    });

    render(await HomePage());

    expect(screen.getByText("主城区")).toBeInTheDocument();
    expect(
      screen.getByText("实时教学 API 暂不可达，主城区已降级为空态展示。")
    ).toBeInTheDocument();
    expect(screen.getByText("第 0 天教学世界")).toBeInTheDocument();
    expect(screen.getByText("在线家园 0 / 0")).toBeInTheDocument();
  });
});
