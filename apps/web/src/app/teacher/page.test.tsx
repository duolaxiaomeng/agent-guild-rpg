import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { getQuestList } from "../../lib/api-client";
import TeacherPage from "./page";

vi.mock("../../lib/api-client", () => ({
  getQuestList: vi.fn()
}));

describe("teacher page", () => {
  it("renders the teacher workbench from live quest data", async () => {
    vi.mocked(getQuestList).mockResolvedValue([
      { id: "day-1", title: "First Agent Session", status: "completed" },
      { id: "day-2", title: "Prompt Iteration", status: "open" },
      { id: "day-3", title: "Peer Review Prep", status: "locked" }
    ]);

    render(await TeacherPage());

    expect(screen.getByRole("heading", { name: "老师工作台" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Day 关卡面板" })).toBeInTheDocument();
    expect(screen.getByText("当前 Day Day 2")).toBeInTheDocument();
    expect(screen.getByText("已完成 1")).toBeInTheDocument();
    expect(screen.getByText("进行中 1")).toBeInTheDocument();
    expect(screen.getByText("未解锁 1")).toBeInTheDocument();
  });
});
