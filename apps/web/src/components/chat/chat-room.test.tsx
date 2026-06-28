import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ChatRoom } from "./chat-room";

describe("ChatRoom", () => {
  it("renders the student chat workspace and submission controls", () => {
    render(
      <ChatRoom
        studentName="Lin"
        agentLabel="Claude Code"
        sessionSummary="已完成 README 更新、截图整理和提示词修正。"
        latestSubmissionStatus="待老师审核"
        collaborationGuests={["Mia", "Noah"]}
      />
    );

    expect(screen.getByRole("heading", { name: "个人聊天室" })).toBeInTheDocument();
    expect(screen.getByText("Lin 的 Agent 工作间")).toBeInTheDocument();
    expect(screen.getByText("Claude Code")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "今日提交" })).toBeInTheDocument();
    expect(screen.getByText("待老师审核")).toBeInTheDocument();
    expect(screen.getByText("已授权协作者：Mia、Noah")).toBeInTheDocument();
  });
});
