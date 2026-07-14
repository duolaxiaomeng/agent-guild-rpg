import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DayPanel } from "./day-panel";

describe("DayPanel", () => {
  it("renders the current quest day progression and reward", () => {
    render(
      <DayPanel
        currentDayId="day-2"
        days={[
          {
            id: "day-1",
            label: "Day 1",
            title: "首次 Agent 提交",
            status: "completed",
            reward: "解锁工会申请"
          },
          {
            id: "day-2",
            label: "Day 2",
            title: "提示词迭代",
            status: "current",
            reward: "开放互测任务"
          }
        ]}
      />
    );

    expect(screen.getByRole("heading", { name: "每日关卡" })).toBeInTheDocument();
    expect(screen.getByText("Day 2")).toBeInTheDocument();
    expect(screen.getByText("当前进度")).toBeInTheDocument();
    expect(screen.getByText("提示词迭代")).toBeInTheDocument();
    expect(screen.getByText("开放互测任务")).toBeInTheDocument();
  });
});
