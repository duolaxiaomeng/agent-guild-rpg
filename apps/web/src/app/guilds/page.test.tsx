import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { getGuildListSafe } from "../../lib/api-client";
import GuildsPage from "./page";

const getServerSessionMock = vi.hoisted(() => vi.fn());

vi.mock("../../lib/server-session", () => ({
  getServerSession: getServerSessionMock
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() })
}));

vi.mock("../../lib/api-client", () => ({
  getGuildListSafe: vi.fn()
}));

describe("guilds page", () => {
  beforeEach(() => {
    getServerSessionMock.mockResolvedValue({
      status: "authenticated",
      session: {
        token: "session_teacher-1",
        user: { id: "teacher-1", role: "teacher", displayName: "Teacher Lin" }
      }
    });
  });

  it("renders the guild hall overview from the api", async () => {
    vi.mocked(getGuildListSafe).mockResolvedValue({
      degraded: false,
      data: [
        {
          id: "guild-1",
          name: "Morning Forge",
          memberCount: 3,
          collaborationPoints: 12
        }
      ]
    });

    render(await GuildsPage());

    expect(screen.getAllByRole("heading", { name: "工会大厅" }).length).toBeGreaterThan(0);
    expect(screen.getByText("Morning Forge")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("12")).toBeInTheDocument();
  });

  it("renders a safe fallback state when the guild api is unavailable", async () => {
    vi.mocked(getGuildListSafe).mockResolvedValue({
      degraded: true,
      data: []
    });

    render(await GuildsPage());

    expect(screen.getAllByRole("heading", { name: "工会大厅" }).length).toBeGreaterThan(0);
    expect(
      screen.getByText("工会数据暂不可达，当前显示安全空态。")
    ).toBeInTheDocument();
  });
});
