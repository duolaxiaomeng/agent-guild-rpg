import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  acceptGuildInvitation,
  inviteGuildMember,
  removeGuildMember
} from "../../lib/api-client";
import { GuildWorkspace } from "./guild-workspace";

const refreshMock = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: refreshMock })
}));

vi.mock("../../lib/api-client", () => ({
  acceptGuildInvitation: vi.fn(),
  createGuild: vi.fn(),
  declineGuildInvitation: vi.fn(),
  inviteGuildMember: vi.fn(),
  removeGuildMember: vi.fn()
}));

describe("GuildWorkspace", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.setItem(
      "agent-guild-session",
      JSON.stringify({
        token: "session-student",
        user: { id: "student-1", role: "student", displayName: "Lin" }
      })
    );
  });

  it("lets an invited student accept a guild invitation", async () => {
    vi.mocked(acceptGuildInvitation).mockResolvedValue({
      id: "invite-1",
      guildId: "guild-1",
      userId: "student-4",
      role: "member",
      status: "active",
      invitedById: "student-1",
      invitedAt: "2026-07-14T00:00:00.000Z",
      respondedAt: "2026-07-14T00:01:00.000Z",
      createdAt: "2026-07-14T00:00:00.000Z",
      updatedAt: "2026-07-14T00:01:00.000Z",
      guildName: "Morning Forge",
      inviterName: "Lin",
      inviteeEmail: "new-one@academy.test"
    });
    render(
      <GuildWorkspace
        currentUserId="student-4"
        guilds={[
          {
            id: "guild-1",
            name: "Morning Forge",
            description: "Students collaborate on agent projects.",
            memberCount: 3,
            collaborationPoints: 12,
            viewerMembership: null
          }
        ]}
        invitations={[
          {
            id: "invite-1",
            guildId: "guild-1",
            userId: "student-4",
            role: "member",
            status: "invited",
            invitedById: "student-1",
            invitedAt: "2026-07-14T00:00:00.000Z",
            respondedAt: null,
            createdAt: "2026-07-14T00:00:00.000Z",
            updatedAt: "2026-07-14T00:00:00.000Z",
            guildName: "Morning Forge",
            inviterName: "Lin",
            inviteeEmail: "new-one@academy.test"
          }
        ]}
        members={[]}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "接受邀请" }));

    await waitFor(() => {
      expect(acceptGuildInvitation).toHaveBeenCalledWith(
        "invite-1",
        "session-student"
      );
    });
    expect(await screen.findByText("已加入工会。")).toBeInTheDocument();
    expect(screen.getByText("我的工会 · Morning Forge")).toBeInTheDocument();
  });

  it("lets the leader invite and remove members", async () => {
    vi.mocked(inviteGuildMember).mockResolvedValue({} as never);
    vi.mocked(removeGuildMember).mockResolvedValue({} as never);
    render(
      <GuildWorkspace
        currentUserId="student-1"
        guilds={[
          {
            id: "guild-1",
            name: "Morning Forge",
            description: "Students collaborate on agent projects.",
            memberCount: 2,
            collaborationPoints: 12,
            viewerMembership: {
              id: "membership-1",
              userId: "student-1",
              role: "leader",
              status: "active"
            }
          }
        ]}
        invitations={[]}
        members={[
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
          },
          {
            id: "membership-2",
            guildId: "guild-1",
            userId: "student-2",
            displayName: "Mo",
            email: "mo@academy.test",
            role: "member",
            status: "active",
            createdAt: "2026-07-14T00:00:00.000Z",
            updatedAt: "2026-07-14T00:00:00.000Z"
          }
        ]}
      />
    );

    fireEvent.change(screen.getByLabelText("学生注册邮箱"), {
      target: { value: "new-one@academy.test" }
    });
    fireEvent.click(screen.getByRole("button", { name: "发送邀请" }));
    await waitFor(() =>
      expect(inviteGuildMember).toHaveBeenCalledWith(
        "guild-1",
        { email: "new-one@academy.test" },
        "session-student"
      )
    );

    fireEvent.click(screen.getByRole("button", { name: "移除成员" }));
    await waitFor(() =>
      expect(removeGuildMember).toHaveBeenCalledWith(
        "guild-1",
        "student-2",
        "session-student"
      )
    );
    expect(screen.queryByText("Mo")).not.toBeInTheDocument();
  });
});
