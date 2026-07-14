import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createWebsiteLotteryOption, getWebsiteLottery } from "../../lib/api-client";
import { WebsiteLotteryManager } from "./website-lottery-manager";

vi.mock("../../lib/api-client", () => ({
  createWebsiteLotteryOption: vi.fn(),
  deleteWebsiteLotteryOption: vi.fn(),
  getWebsiteLottery: vi.fn(),
  updateWebsiteLotteryOption: vi.fn()
}));

describe("WebsiteLotteryManager", () => {
  beforeEach(() => {
    window.localStorage.setItem("agent-guild-session", JSON.stringify({ token: "session-teacher", user: { id: "teacher-1", role: "teacher", displayName: "Teacher" } }));
    vi.mocked(getWebsiteLottery).mockResolvedValue({
      dayId: "day-1",
      options: [
        { id: "option-1", dayId: "day-1", label: "Agent 学习习惯网站", description: "让 Agent 记录每天的学习节奏、专注时间和完成情况。", isActive: true, sortOrder: 1 }
      ],
      draw: null
    });
  });

  it("lets a teacher add a categorized system topic into the lottery pool", async () => {
    vi.mocked(createWebsiteLotteryOption).mockResolvedValue({
      id: "option-2",
      dayId: "day-1",
      label: "Agent 消费记账网站",
      description: "让 Agent 记录日常支出、分类统计和预算管理。",
      isActive: true,
      sortOrder: 2
    });

    render(<WebsiteLotteryManager dayId="day-1" />);

    fireEvent.click(await screen.findByText("日常生活 Agent"));
    fireEvent.click(screen.getByRole("button", { name: /Agent 消费记账网站/ }));

    await waitFor(() => expect(createWebsiteLotteryOption).toHaveBeenCalledWith(
      "day-1",
      expect.objectContaining({
        label: "Agent 消费记账网站",
        description: "让 Agent 记录日常支出、分类统计和预算管理。"
      }),
      "session-teacher"
    ));
    await waitFor(() => expect(screen.getByText("已加入题库项：Agent 消费记账网站")).toBeInTheDocument());
  });

  it("filters the bank by difficulty before adding a topic", async () => {
    vi.mocked(createWebsiteLotteryOption).mockResolvedValue({
      id: "option-3",
      dayId: "day-1",
      label: "Agent 短视频选题网站",
      description: "让 Agent 根据关键词、热点和个人定位生成选题池。",
      isActive: true,
      sortOrder: 2
    });

    render(<WebsiteLotteryManager dayId="day-1" />);

    const difficultyGroup = await screen.findByRole("group", { name: "题库难度筛选" });
    fireEvent.click(await within(difficultyGroup).findByRole("button", { name: /较难/ }));
    fireEvent.click(screen.getByText("抖音小红书 Agent 项目"));
    fireEvent.click(screen.getByRole("button", { name: /Agent 短视频选题网站/ }));

    await waitFor(() => expect(createWebsiteLotteryOption).toHaveBeenCalledWith(
      "day-1",
      expect.objectContaining({
        label: "Agent 短视频选题网站"
      }),
      "session-teacher"
    ));
  });
});
