import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { drawWebsiteLottery, getWebsiteLottery } from "../../lib/api-client";
import { WebsiteLotteryPanel } from "./website-lottery-panel";

vi.mock("../../lib/api-client", () => ({
  getWebsiteLottery: vi.fn(),
  drawWebsiteLottery: vi.fn()
}));

describe("WebsiteLotteryPanel", () => {
  beforeEach(() => {
    window.localStorage.setItem("agent-guild-session", JSON.stringify({ token: "session-student", user: { id: "student-1", role: "student", displayName: "Lin" } }));
    vi.mocked(getWebsiteLottery).mockResolvedValue({ dayId: "day-1", options: [{ id: "option-1", dayId: "day-1", label: "作品集网站", description: "展示项目", isActive: true, sortOrder: 1 }], draw: null });
  });

  it("draws and shows the persisted website topic", async () => {
    vi.mocked(drawWebsiteLottery).mockResolvedValue({
      alreadyDrawn: false,
      draw: { id: "draw-1", dayId: "day-1", studentId: "student-1", drawnAt: "2026-07-14T10:00:00.000Z", option: { id: "option-1", dayId: "day-1", label: "作品集网站", description: "展示项目", isActive: true, sortOrder: 1 } }
    });
    render(<WebsiteLotteryPanel dayId="day-1" />);
    fireEvent.click(await screen.findByRole("button", { name: "开始抽签" }));
    await waitFor(() => expect(screen.getByText("作品集网站")).toBeInTheDocument());
    expect(drawWebsiteLottery).toHaveBeenCalledWith("day-1", "session-student");
  });
});
