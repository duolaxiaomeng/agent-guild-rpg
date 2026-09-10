import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { drawWebsiteLottery, getWebsiteLottery, redrawWebsiteLottery } from "../../lib/api-client";
import { WebsiteLotteryPanel } from "./website-lottery-panel";

vi.mock("../../lib/api-client", () => ({
  getWebsiteLottery: vi.fn(),
  drawWebsiteLottery: vi.fn(),
  redrawWebsiteLottery: vi.fn()
}));

describe("WebsiteLotteryPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.setItem("agent-guild-session", JSON.stringify({ token: "session-student", user: { id: "student-1", role: "student", displayName: "Lin" } }));
    vi.mocked(getWebsiteLottery).mockResolvedValue({ dayId: "day-1", agentOnline: true, options: [{ id: "option-1", dayId: "day-1", label: "作品集网站", description: "展示项目", isActive: true, sortOrder: 1 }], draw: null });
  });

  it("renders as a compact top reward and expands on demand", async () => {
    render(<WebsiteLotteryPanel dayId="day-1" />);

    const panel = await screen.findByLabelText("Day 网站主题抽奖");
    const toggle = screen.getByRole("button", { name: "展开今日奖励" });
    expect(panel).toHaveAttribute("data-placement", "below-zone-navigation");
    expect(panel).toHaveAttribute("data-expanded", "false");
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("抽取你要做的网站类型")).not.toBeInTheDocument();

    fireEvent.click(toggle);

    expect(panel).toHaveAttribute("data-expanded", "true");
    expect(screen.getByRole("button", { name: "收起今日奖励" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("抽取你要做的网站类型")).toBeInTheDocument();
  });

  it("draws and shows the persisted website topic", async () => {
    vi.mocked(drawWebsiteLottery).mockResolvedValue({
      alreadyDrawn: false,
      draw: { id: "draw-1", dayId: "day-1", studentId: "student-1", drawnAt: "2026-07-14T10:00:00.000Z", option: { id: "option-1", dayId: "day-1", label: "作品集网站", description: "展示项目", isActive: true, sortOrder: 1 } }
    });
    render(<WebsiteLotteryPanel dayId="day-1" />);
    fireEvent.click(await screen.findByRole("button", { name: "展开今日奖励" }));
    fireEvent.click(await screen.findByRole("button", { name: "让 Agent 抽取奖励" }));
    await waitFor(() => expect(screen.getByText("作品集网站")).toBeInTheDocument());
    expect(drawWebsiteLottery).toHaveBeenCalledWith("day-1", "session-student");
  });

  it("returns a topic and redraws when the student does not want it", async () => {
    vi.mocked(drawWebsiteLottery).mockResolvedValue({
      alreadyDrawn: false,
      draw: { id: "draw-1", dayId: "day-1", studentId: "student-1", drawnAt: "2026-07-14T10:00:00.000Z", option: { id: "option-1", dayId: "day-1", label: "作品集网站", description: "展示项目", isActive: true, sortOrder: 1 } }
    });
    vi.mocked(redrawWebsiteLottery).mockResolvedValue({
      alreadyDrawn: false,
      draw: { id: "draw-2", dayId: "day-1", studentId: "student-1", drawnAt: "2026-07-14T10:05:00.000Z", option: { id: "option-2", dayId: "day-1", label: "短视频选题网站", description: "生成选题池", isActive: true, sortOrder: 2 } }
    });

    render(<WebsiteLotteryPanel dayId="day-1" />);
    fireEvent.click(await screen.findByRole("button", { name: "展开今日奖励" }));
    fireEvent.click(await screen.findByRole("button", { name: "让 Agent 抽取奖励" }));
    await waitFor(() => expect(screen.getByText("作品集网站")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "不要这个，让 Agent 重抽" }));
    await waitFor(() => expect(screen.getByText("短视频选题网站")).toBeInTheDocument());
    expect(redrawWebsiteLottery).toHaveBeenCalledWith("day-1", "session-student");
  });

  it("keeps the reward visible when the teacher has not bound a lottery to this Day", async () => {
    vi.mocked(getWebsiteLottery).mockResolvedValue({ dayId: "day-2", agentOnline: true, options: [], draw: null });
    render(<WebsiteLotteryPanel dayId="day-2" />);
    const panel = await screen.findByLabelText("Day 网站主题抽奖");
    expect(panel).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "展开今日奖励" }));
    expect(screen.getByRole("button", { name: "奖励池待配置" })).toBeDisabled();
  });

  it("lets the user see the reward but blocks drawing while the Agent is offline", async () => {
    vi.mocked(getWebsiteLottery).mockResolvedValue({ dayId: "day-1", agentOnline: false, options: [{ id: "option-1", dayId: "day-1", label: "作品集网站", description: "展示项目", isActive: true, sortOrder: 1 }], draw: null });
    render(<WebsiteLotteryPanel dayId="day-1" />);

    fireEvent.click(await screen.findByRole("button", { name: "展开今日奖励" }));
    expect(screen.getByRole("button", { name: "等待 Agent 接入" })).toBeDisabled();
    expect(drawWebsiteLottery).not.toHaveBeenCalled();
  });
});
