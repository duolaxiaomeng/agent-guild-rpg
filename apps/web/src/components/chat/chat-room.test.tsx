import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  createRoomAccessGrant,
  createSubmission,
  revokeRoomAccessGrant
} from "../../lib/api-client";
import { ChatRoom } from "./chat-room";

vi.mock("../../lib/api-client", () => ({
  createSubmission: vi.fn(),
  createRoomAccessGrant: vi.fn(),
  revokeRoomAccessGrant: vi.fn()
}));

describe("ChatRoom", () => {
  it("renders the student chat workspace and submission controls", () => {
    render(
      <ChatRoom
        studentName="Lin"
        agentLabel="Claude Code"
        sessionStatusLabel="进行中"
        sessionSummary="已完成 README 更新、截图整理和提示词修正。"
        latestSubmissionStatus="待老师审核"
        latestSubmissionMeta="Day 1 · 2026-06-29 10:00"
        roomId="room-chat-student-1"
        accessGrants={[
          {
            id: "grant-1",
            roomId: "room-chat-student-1",
            granteeId: "student-2",
            granteeName: "Mia",
            scope: "chat_summary",
            status: "approved",
            createdAt: "2026-06-29T10:00:00.000Z",
            expiresAt: "2026-06-30T10:00:00.000Z"
          },
          {
            id: "grant-2",
            roomId: "room-chat-student-1",
            granteeId: "student-3",
            granteeName: "Noah",
            scope: "chat_summary",
            status: "revoked",
            createdAt: "2026-06-29T09:00:00.000Z",
            expiresAt: "2026-06-30T09:00:00.000Z"
          }
        ]}
        collaborationGuests={[
          {
            studentName: "Mia",
            contributionLabel: "协作贡献 4"
          },
          {
            studentName: "Noah",
            contributionLabel: "协作贡献 2"
          }
        ]}
      />
    );

    expect(screen.getByRole("heading", { name: "个人聊天室" })).toBeInTheDocument();
    expect(screen.getByText("Lin 的 Agent 工作间")).toBeInTheDocument();
    expect(screen.getByText("Claude Code")).toBeInTheDocument();
    expect(screen.getByText("会话状态：进行中")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "今日提交" })).toBeInTheDocument();
    expect(screen.getByText("待老师审核")).toBeInTheDocument();
    expect(screen.getByText("Day 1 · 2026-06-29 10:00")).toBeInTheDocument();
    expect(
      screen.getByText("已授权协作者：Mia（协作贡献 4）、Noah（协作贡献 2）")
    ).toBeInTheDocument();
    expect(screen.getByText("Mia · chat_summary · 生效中")).toBeInTheDocument();
    expect(screen.getByText("Noah · chat_summary · 已撤销")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "创建授权" })).toBeInTheDocument();
  });

  it("submits the current chat progress when the user clicks 今日提交", async () => {
    vi.mocked(createSubmission).mockResolvedValue({
      submission: {
        id: "submission-2"
      }
    });

    render(
      <ChatRoom
        studentName="Lin"
        agentLabel="Claude Code"
        sessionStatusLabel="进行中"
        sessionSummary="已完成 README 更新、截图整理和提示词修正。"
        latestSubmissionStatus="今日未提交"
        roomId="room-chat-student-1"
        accessGrants={[]}
        collaborationGuests={[]}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "今日提交" }));

    await waitFor(() => {
      expect(createSubmission).toHaveBeenCalledTimes(1);
    });
  });

  it("creates a room access grant from the chat room and appends it to the list", async () => {
    vi.mocked(createRoomAccessGrant).mockResolvedValue({
      id: "grant-3",
      roomId: "room-chat-student-1",
      granteeId: "student-2",
      granteeName: "Mo",
      scope: "chat_summary",
      status: "approved",
      createdAt: "2026-06-29T11:00:00.000Z",
      expiresAt: "2026-06-30T11:00:00.000Z"
    });

    render(
      <ChatRoom
        studentName="Lin"
        agentLabel="Claude Code"
        sessionStatusLabel="进行中"
        sessionSummary="已完成 README 更新、截图整理和提示词修正。"
        latestSubmissionStatus="今日未提交"
        roomId="room-chat-student-1"
        accessGrants={[]}
        collaborationGuests={[]}
      />
    );

    fireEvent.change(screen.getByLabelText("授权学生 ID"), {
      target: { value: "student-2" }
    });
    fireEvent.click(screen.getByRole("button", { name: "创建授权" }));

    await waitFor(() => {
      expect(createRoomAccessGrant).toHaveBeenCalledWith({
        roomId: "room-chat-student-1",
        granteeId: "student-2",
        scope: "chat_summary",
        expiresInHours: 24
      });
    });
    expect(screen.getByText("Mo · chat_summary · 生效中")).toBeInTheDocument();
    expect(screen.getByText("授权已创建。")).toBeInTheDocument();
  });

  it("revokes an active room access grant from the chat room", async () => {
    vi.mocked(revokeRoomAccessGrant).mockResolvedValue({
      id: "grant-1",
      roomId: "room-chat-student-1",
      granteeId: "student-2",
      granteeName: "Mo",
      scope: "chat_summary",
      status: "revoked",
      createdAt: "2026-06-29T10:00:00.000Z",
      expiresAt: "2026-06-30T10:00:00.000Z"
    });

    render(
      <ChatRoom
        studentName="Lin"
        agentLabel="Claude Code"
        sessionStatusLabel="进行中"
        sessionSummary="已完成 README 更新、截图整理和提示词修正。"
        latestSubmissionStatus="今日未提交"
        roomId="room-chat-student-1"
        accessGrants={[
          {
            id: "grant-1",
            roomId: "room-chat-student-1",
            granteeId: "student-2",
            granteeName: "Mo",
            scope: "chat_summary",
            status: "approved",
            createdAt: "2026-06-29T10:00:00.000Z",
            expiresAt: "2026-06-30T10:00:00.000Z"
          }
        ]}
        collaborationGuests={[]}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "撤销 Mo" }));

    await waitFor(() => {
      expect(revokeRoomAccessGrant).toHaveBeenCalledWith("grant-1");
    });
    expect(screen.getByText("Mo · chat_summary · 已撤销")).toBeInTheDocument();
    expect(screen.getByText("授权已撤销。")).toBeInTheDocument();
  });
});
