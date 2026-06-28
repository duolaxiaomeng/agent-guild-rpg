import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createSubmission } from "../../lib/api-client";
import { ChatRoom } from "./chat-room";

vi.mock("../../lib/api-client", () => ({
  createSubmission: vi.fn()
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
        collaborationGuests={[]}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "今日提交" }));

    await waitFor(() => {
      expect(createSubmission).toHaveBeenCalledTimes(1);
    });
  });
});
