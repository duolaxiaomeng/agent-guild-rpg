import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createChatMessage,
  createRoomAccessGrant,
  createSubmission,
  getChatRoom,
  revokeRoomAccessGrant,
  type ChatMessage
} from "../../lib/api-client";
import { ChatRoom } from "./chat-room";

const chatSocketHarness = vi.hoisted(() => ({
  options: undefined as
    | {
        onMessage: (message: ChatMessage) => void;
        onConnectionState?: (state: string) => void;
      }
    | undefined,
  disconnect: vi.fn(),
  create: vi.fn((options: {
    onMessage: (message: ChatMessage) => void;
    onConnectionState?: (state: string) => void;
  }) => {
    chatSocketHarness.options = options;
    return { disconnect: chatSocketHarness.disconnect };
  })
}));

vi.mock("../../lib/api-client", () => ({
  createChatMessage: vi.fn(),
  createSubmission: vi.fn(),
  createRoomAccessGrant: vi.fn(),
  revokeRoomAccessGrant: vi.fn(),
  getChatRoom: vi.fn().mockResolvedValue({ messages: [] })
}));

vi.mock("./chat-socket", () => ({
  createChatSocket: chatSocketHarness.create
}));

function chatRoomResponse(messages: ChatMessage[]) {
  return {
    roomId: "room-chat-student-1",
    viewerRole: "owner" as const,
    studentId: "student-1",
    studentName: "Lin",
    agentSessionId: "session-1",
    canSubmit: true,
    agentLabel: "Claude Code",
    sessionStatus: "active" as const,
    sessionSummary: "",
    latestSubmission: null,
    collaborationGuests: [],
    messages
  };
}

describe("ChatRoom", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    chatSocketHarness.options = undefined;
    vi.mocked(getChatRoom).mockImplementation(
      () => new Promise(() => undefined)
    );
    window.localStorage.setItem(
      "agent-guild-session",
      JSON.stringify({
        token: "session_student-1",
        user: {
          id: "student-1",
          role: "student",
          displayName: "Lin"
        }
      })
    );
  });

  it("appends a room-scoped WebSocket message without waiting for polling", async () => {
    render(
      <ChatRoom
        studentName="Lin"
        viewerRole="owner"
        agentLabel="Claude Code"
        sessionStatusLabel="进行中"
        sessionSummary="正在协作"
        latestSubmissionStatus="今日未提交"
        roomId="room-chat-student-1"
        accessGrants={[]}
        collaborationGuests={[]}
        messages={[]}
      />
    );

    act(() => {
      chatSocketHarness.options?.onMessage({
        id: "message-realtime-1",
        roomId: "room-chat-student-1",
        authorId: "student-2",
        authorName: "Mo",
        body: "WebSocket 实时消息",
        createdAt: "2026-07-14T10:00:00.000Z"
      });
    });

    expect(screen.getByText("WebSocket 实时消息")).toBeInTheDocument();
  });

  it("renders the student chat workspace and submission controls", () => {
    render(
      <ChatRoom
        studentName="Lin"
        viewerRole="owner"
        agentLabel="Claude Code"
        sessionStatusLabel="进行中"
        sessionSummary="已完成 README 更新、截图整理和提示词修正。"
        latestSubmissionStatus="待老师审核"
        latestSubmissionMeta="Day 1 · 2026-06-29 10:00"
        studentId="student-1"
        roomId="room-chat-student-1"
        courseWorldId="course-world-1"
        dayId="day-1"
        agentSessionId="session-1"
        canSubmit
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
        messages={[
          {
            id: "message-1",
            roomId: "room-chat-student-1",
            authorId: "student-1",
            authorName: "Lin",
            body: "我先把 README 修正完，再补截图。",
            createdAt: "2026-06-29T10:05:00.000Z"
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
    expect(screen.getByText("我先把 README 修正完，再补截图。")).toBeInTheDocument();
    expect(
      screen.getByText("已授权协作者：Mia（协作贡献 4）、Noah（协作贡献 2）")
    ).toBeInTheDocument();
    expect(screen.getByText("Mia · chat_summary · 生效中")).toBeInTheDocument();
    expect(screen.getByText("Noah · chat_summary · 已撤销")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "创建授权" })).toBeInTheDocument();
    const enterRoomLink = screen.getByRole("link", { name: "进入房间" });
    expect(enterRoomLink.getAttribute("href")).toContain("room-chat-student-1");
  });

  it("submits the current chat progress when the user clicks 今日提交", async () => {
    vi.mocked(createSubmission).mockResolvedValue({
      submission: {
        id: "submission-2"
      },
      queue: { jobId: "review-submission-2", status: "queued" }
    });

    render(
      <ChatRoom
        studentName="Lin"
        viewerRole="owner"
        agentLabel="Claude Code"
        sessionStatusLabel="进行中"
        sessionSummary="已完成 README 更新、截图整理和提示词修正。"
        latestSubmissionStatus="今日未提交"
        studentId="student-1"
        roomId="room-chat-student-1"
        courseWorldId="course-world-1"
        dayId="day-1"
        agentSessionId="session-1"
        canSubmit
        accessGrants={[]}
        collaborationGuests={[]}
        messages={[]}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "今日提交" }));

    await waitFor(() => {
      expect(createSubmission).toHaveBeenCalledTimes(1);
      expect(createSubmission).toHaveBeenCalledWith(
        expect.objectContaining({
          studentId: "student-1",
          clientRequestId: expect.stringMatching(/^chat-submit:/),
          courseWorldId: "course-world-1",
          dayId: "day-1",
          agentSessionId: "session-1",
          triggerType: "button",
          conversationSummary: "已完成 README 更新、截图整理和提示词修正。",
          artifacts: [
            {
              kind: "doc",
              label: "聊天室提交快照",
              url: "/chat?roomId=room-chat-student-1"
            }
          ]
        }),
        "session_student-1"
      );
    });
  });

  it("shows a session-expired message when 今日提交 is clicked without a current session", async () => {
    window.localStorage.removeItem("agent-guild-session");

    render(
      <ChatRoom
        studentName="Lin"
        viewerRole="owner"
        agentLabel="Claude Code"
        sessionStatusLabel="进行中"
        sessionSummary="已完成 README 更新、截图整理和提示词修正。"
        latestSubmissionStatus="今日未提交"
        studentId="student-1"
        roomId="room-chat-student-1"
        courseWorldId="course-world-1"
        dayId="day-1"
        agentSessionId="session-1"
        canSubmit
        accessGrants={[]}
        collaborationGuests={[]}
        messages={[]}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "今日提交" }));

    await waitFor(() => {
      expect(createSubmission).not.toHaveBeenCalled();
      expect(screen.getByText("当前登录已失效，请重新登录。")).toBeInTheDocument();
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
        viewerRole="owner"
        agentLabel="Claude Code"
        sessionStatusLabel="进行中"
        sessionSummary="已完成 README 更新、截图整理和提示词修正。"
        latestSubmissionStatus="今日未提交"
        roomId="room-chat-student-1"
        accessGrants={[]}
        collaborationGuests={[]}
        messages={[]}
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
      }, "session_student-1");
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
        viewerRole="owner"
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
        messages={[]}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "撤销 Mo" }));

    await waitFor(() => {
      expect(revokeRoomAccessGrant).toHaveBeenCalledWith(
        "grant-1",
        "session_student-1"
      );
    });
    expect(screen.getByText("Mo · chat_summary · 已撤销")).toBeInTheDocument();
    expect(screen.getByText("授权已撤销。")).toBeInTheDocument();
  });

  it("posts a text chat message and appends it to the room timeline", async () => {
    vi.mocked(createChatMessage).mockResolvedValue({
      id: "message-2",
      roomId: "room-chat-student-1",
      authorId: "student-1",
      authorName: "Lin",
      body: "我已经把验证步骤写进 README 了。",
      createdAt: "2026-06-29T11:30:00.000Z"
    });

    render(
      <ChatRoom
        studentName="Lin"
        viewerRole="owner"
        agentLabel="Claude Code"
        sessionStatusLabel="进行中"
        sessionSummary="已完成 README 更新、截图整理和提示词修正。"
        latestSubmissionStatus="今日未提交"
        roomId="room-chat-student-1"
        accessGrants={[]}
        collaborationGuests={[]}
        messages={[]}
      />
    );

    fireEvent.change(screen.getByLabelText("消息内容"), {
      target: { value: "我已经把验证步骤写进 README 了。" }
    });
    fireEvent.click(screen.getByRole("button", { name: "发送消息" }));

    await waitFor(() => {
      expect(createChatMessage).toHaveBeenCalledWith(
        {
          roomId: "room-chat-student-1",
          content: "我已经把验证步骤写进 README 了。"
        },
        "session_student-1"
      );
    });
    expect(screen.getByText("我已经把验证步骤写进 README 了。")).toBeInTheDocument();
    expect(screen.getByText("消息已发送。")).toBeInTheDocument();
  });

  it("renders a guest room view without access management controls", () => {
    render(
      <ChatRoom
        studentName="Lin"
        viewerRole="guest"
        agentLabel="Claude Code"
        sessionStatusLabel="进行中"
        sessionSummary="房主正在整理最新提交摘要。"
        latestSubmissionStatus="待老师审核"
        roomId="room-chat-student-1"
        accessGrants={[]}
        collaborationGuests={[]}
        messages={[
          {
            id: "message-guest-1",
            roomId: "room-chat-student-1",
            authorId: "student-1",
            authorName: "Lin",
            body: "欢迎进来一起看这次修改记录。",
            createdAt: "2026-06-29T09:00:00.000Z"
          }
        ]}
      />
    );

    expect(screen.getByRole("heading", { name: "协作聊天室" })).toBeInTheDocument();
    expect(screen.getByText("Lin 的协作房间")).toBeInTheDocument();
    expect(screen.queryByText("授权列表")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "创建授权" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /进入房间/ })).not.toBeInTheDocument();
    expect(screen.getByText("欢迎进来一起看这次修改记录。")).toBeInTheDocument();
  });

  it("renders a teacher read-only view without submission, access, or message controls", () => {
    render(
      <ChatRoom
        studentName="Lin"
        viewerRole="teacher"
        agentLabel="Claude Code"
        sessionStatusLabel="进行中"
        sessionSummary="学生正在整理 README 与截图。"
        latestSubmissionStatus="待老师审核"
        latestSubmissionMeta="Day 1 · 2026-06-29 10:00"
        roomId="room-chat-student-1"
        accessGrants={[]}
        collaborationGuests={[]}
        messages={[
          {
            id: "message-teacher-1",
            roomId: "room-chat-student-1",
            authorId: "student-1",
            authorName: "Lin",
            body: "我先把 README 修正完，再补截图。",
            createdAt: "2026-06-29T10:05:00.000Z"
          }
        ]}
      />
    );

    expect(screen.getByRole("heading", { name: "Teacher 观察" })).toBeInTheDocument();
    expect(screen.getByText("旁观 Lin 的房间")).toBeInTheDocument();
    expect(screen.getByText("我先把 README 修正完，再补截图。")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "今日提交" })).not.toBeInTheDocument();
    expect(screen.queryByText("授权列表")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "创建授权" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("消息内容")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "发送消息" })).not.toBeInTheDocument();
    expect(screen.getByText("待老师审核")).toBeInTheDocument();
    expect(screen.getByText("Day 1 · 2026-06-29 10:00")).toBeInTheDocument();
  });

  it("polls the chat room for new messages on an interval and appends fresh ones", async () => {
    vi.useFakeTimers();

    try {
      vi.mocked(getChatRoom).mockResolvedValue(chatRoomResponse([]));

      render(
        <ChatRoom
          studentName="Lin"
          viewerRole="owner"
          agentLabel="Claude Code"
          sessionStatusLabel="进行中"
          sessionSummary="已完成 README 更新、截图整理和提示词修正。"
          latestSubmissionStatus="今日未提交"
          roomId="room-chat-student-1"
          accessGrants={[]}
          collaborationGuests={[]}
          messages={[]}
        />
      );

      vi.mocked(getChatRoom).mockResolvedValue(
        chatRoomResponse([
          {
            id: "message-poll-1",
            roomId: "room-chat-student-1",
            authorId: "student-2",
            authorName: "Mo",
            body: "轮询拉到的新消息",
            createdAt: "2026-06-29T12:00:00.000Z"
          }
        ])
      );

      await act(async () => {
        await vi.advanceTimersByTimeAsync(10_000);
      });

      expect(screen.getByText("轮询拉到的新消息")).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("stops polling once the chat room unmounts", async () => {
    vi.useFakeTimers();

    try {
      const { unmount } = render(
        <ChatRoom
          studentName="Lin"
          viewerRole="owner"
          agentLabel="Claude Code"
          sessionStatusLabel="进行中"
          sessionSummary="已完成 README 更新、截图整理和提示词修正。"
          latestSubmissionStatus="今日未提交"
          roomId="room-chat-student-1"
          accessGrants={[]}
          collaborationGuests={[]}
          messages={[]}
        />
      );

      unmount();

      await act(async () => {
        vi.advanceTimersByTime(10_000);
      });

      // The room performs one immediate refresh on mount. Unmounting must
      // cancel the interval so no additional refresh occurs afterwards.
      expect(getChatRoom).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("sorts polled messages by createdAt when an earlier message arrives after a later one", async () => {
    vi.useFakeTimers();

    try {
      vi.mocked(getChatRoom).mockResolvedValue(
        chatRoomResponse([
          {
            id: "msg-early",
            roomId: "room-chat-student-1",
            authorId: "student-2",
            authorName: "Mo",
            body: "较早的消息",
            createdAt: "2026-06-29T10:15:00.000Z"
          },
          {
            id: "msg-late",
            roomId: "room-chat-student-1",
            authorId: "student-1",
            authorName: "Lin",
            body: "较晚的消息",
            createdAt: "2026-06-29T10:20:00.000Z"
          }
        ])
      );

      render(
        <ChatRoom
          studentName="Lin"
          viewerRole="owner"
          agentLabel="Claude Code"
          sessionStatusLabel="进行中"
          sessionSummary="已完成 README 更新、截图整理和提示词修正。"
          latestSubmissionStatus="今日未提交"
          roomId="room-chat-student-1"
          accessGrants={[]}
          collaborationGuests={[]}
          messages={[
            {
              id: "msg-late",
              roomId: "room-chat-student-1",
              authorId: "student-1",
              authorName: "Lin",
              body: "较晚的消息",
              createdAt: "2026-06-29T10:20:00.000Z"
            }
          ]}
        />
      );

      await act(async () => {
        vi.advanceTimersByTime(10_000);
      });

      vi.useRealTimers();

      await waitFor(() => {
        const items = screen.getAllByRole("listitem");
        expect(items).toHaveLength(2);
        expect(items[0].textContent).toContain("较早的消息");
        expect(items[1].textContent).toContain("较晚的消息");
      });
    } finally {
      vi.useRealTimers();
    }
  });
});
