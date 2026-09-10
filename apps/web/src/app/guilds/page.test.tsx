import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getGuildListSafe,
  getGuildMembersSafe,
  getMyGuildInvitationsSafe
} from "../../lib/api-client";
import GuildsPage from "./page";

const getServerSessionMock = vi.hoisted(() => vi.fn());

vi.mock("../../lib/server-session", () => ({
  getServerSession: getServerSessionMock
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() })
}));

vi.mock("../../lib/api-client", () => ({
  getGuildListSafe: vi.fn(),
  getGuildMembersSafe: vi.fn(),
  getMyGuildInvitationsSafe: vi.fn(),
  acceptGuildInvitation: vi.fn(),
  createGuild: vi.fn(),
  declineGuildInvitation: vi.fn(),
  inviteGuildMember: vi.fn(),
  removeGuildMember: vi.fn()
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

  it("loads the current student's invitations and active guild members", async () => {
    getServerSessionMock.mockResolvedValue({
      status: "authenticated",
      session: {
        token: "session_student-1",
        user: { id: "student-1", role: "student", displayName: "Lin" }
      }
    });
    vi.mocked(getGuildListSafe).mockResolvedValue({
      degraded: false,
      data: [
        {
          id: "guild-1",
          name: "Morning Forge",
          description: "Students collaborate on agent projects.",
          memberCount: 1,
          collaborationPoints: 12,
          viewerMembership: {
            id: "membership-1",
            userId: "student-1",
            role: "leader",
            status: "active"
          }
        }
      ]
    });
    vi.mocked(getMyGuildInvitationsSafe).mockResolvedValue({
      degraded: false,
      data: []
    });
    vi.mocked(getGuildMembersSafe).mockResolvedValue({
      degraded: false,
      data: [
        {
          id: "membership-1",
          guildId: "guild-1",
          userId: "student-1",
          displayName: "Lin",
          email: "lin@academy.test",
          role: "leader",
          status: "active",
          createdAt: "2026-07-14T00:00:00.000Z",
          updatedAt: "2026-07-14T00:00:00.000Z"
        }
      ]
    });

    render(await GuildsPage());

    expect(getMyGuildInvitationsSafe).toHaveBeenCalledWith("session_student-1");
    expect(getGuildMembersSafe).toHaveBeenCalledWith(
      "guild-1",
      "session_student-1"
    );
    expect(screen.getByText("我的工会 · Morning Forge")).toBeInTheDocument();
    expect(screen.getByText("Lin")).toBeInTheDocument();
  });
});
