import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ReviewQueue } from "./review-queue";

describe("ReviewQueue", () => {
  it("shows teacher quest overview derived from live data", () => {
    render(
      <ReviewQueue
        summary={{
          currentDayLabel: "Day 2",
          completedCount: 1,
          activeCount: 1,
          lockedCount: 1
        }}
        items={[
          {
            id: "day-2",
            label: "Day 2",
            title: "Prompt Iteration",
            statusLabel: "进行中"
          }
        ]}
      />
    );

    expect(screen.getByRole("heading", { name: "老师工作台" })).toBeInTheDocument();
    expect(screen.getByText("当前 Day Day 2")).toBeInTheDocument();
    expect(screen.getByText("已完成 1")).toBeInTheDocument();
    expect(screen.getByText("进行中 1")).toBeInTheDocument();
    expect(screen.getByText("未解锁 1")).toBeInTheDocument();
    expect(screen.getByText("Prompt Iteration")).toBeInTheDocument();
  });
});
