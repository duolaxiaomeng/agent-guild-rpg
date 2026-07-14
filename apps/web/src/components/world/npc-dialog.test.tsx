import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { fetchNpcConversationSafe } from "../../lib/api-client";
import { NpcDialog } from "./npc-dialog";

vi.mock("../../lib/api-client", () => ({
  fetchNpcConversationSafe: vi.fn(),
}));

describe("NpcDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the dialog with NPC name", async () => {
    vi.mocked(fetchNpcConversationSafe).mockResolvedValue({
      data: {
        npcId: "receptionist",
        npcName: "前台接待",
        reply: "欢迎来到工作室！",
        degraded: false,
      },
      degraded: false,
    });

    render(
      <NpcDialog
        npcId="receptionist"
        npcName="前台接待"
        fallbackText="欢迎来到工作室！"
        onClose={() => {}}
      />,
    );

    // Header should show NPC name immediately
    expect(screen.getByText("前台接待")).toBeInTheDocument();

    // Wait for the reply to load
    await waitFor(() => {
      expect(screen.getByText("欢迎来到工作室！")).toBeInTheDocument();
    });
  });

  it("falls back to static text when API is degraded", async () => {
    vi.mocked(fetchNpcConversationSafe).mockResolvedValue({
      data: {
        npcId: "reviewer",
        npcName: "评审员",
        reply: "",
        degraded: true,
      },
      degraded: true,
    });

    render(
      <NpcDialog
        npcId="reviewer"
        npcName="评审员"
        fallbackText="新提交待审核"
        onClose={() => {}}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("新提交待审核")).toBeInTheDocument();
    });

    // Should show offline mode badge
    expect(screen.getByText("离线模式")).toBeInTheDocument();
  });

  it("calls onClose when close button is clicked", async () => {
    vi.mocked(fetchNpcConversationSafe).mockResolvedValue({
      data: {
        npcId: "receptionist",
        npcName: "前台接待",
        reply: "你好",
        degraded: false,
      },
      degraded: false,
    });

    const onClose = vi.fn();
    render(
      <NpcDialog
        npcId="receptionist"
        npcName="前台接待"
        fallbackText="你好"
        onClose={onClose}
      />,
    );

    const closeBtn = screen.getByLabelText("关闭对话");
    fireEvent.click(closeBtn);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("sends a message and displays the reply", async () => {
    // First call: greeting
    vi.mocked(fetchNpcConversationSafe).mockResolvedValueOnce({
      data: {
        npcId: "pm",
        npcName: "项目经理",
        reply: "冲刺任务进行中！",
        degraded: false,
      },
      degraded: false,
    });

    // Second call: reply to message
    vi.mocked(fetchNpcConversationSafe).mockResolvedValueOnce({
      data: {
        npcId: "pm",
        npcName: "项目经理",
        reply: "当前进度80%。",
        degraded: false,
      },
      degraded: false,
    });

    render(
      <NpcDialog
        npcId="pm"
        npcName="项目经理"
        fallbackText="冲刺任务进行中"
        onClose={() => {}}
      />,
    );

    // Wait for greeting
    await waitFor(() => {
      expect(screen.getByText("冲刺任务进行中！")).toBeInTheDocument();
    });

    // Type a message and send
    const input = screen.getByLabelText("发送消息给NPC");
    fireEvent.change(input, { target: { value: "进度如何？" } });
    fireEvent.keyDown(input, { key: "Enter" });

    // Wait for the reply
    await waitFor(() => {
      expect(screen.getByText("当前进度80%。")).toBeInTheDocument();
    });

    // Verify the message was sent via API
    expect(fetchNpcConversationSafe).toHaveBeenCalledTimes(2);
    expect(fetchNpcConversationSafe).toHaveBeenLastCalledWith("pm", undefined, "进度如何？");
  });

  it("has the correct dialog role and aria-label", async () => {
    vi.mocked(fetchNpcConversationSafe).mockResolvedValue({
      data: {
        npcId: "receptionist",
        npcName: "前台接待",
        reply: "你好",
        degraded: false,
      },
      degraded: false,
    });

    render(
      <NpcDialog
        npcId="receptionist"
        npcName="前台接待"
        fallbackText="你好"
        onClose={() => {}}
      />,
    );

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-label", "与前台接待对话");
  });
});
