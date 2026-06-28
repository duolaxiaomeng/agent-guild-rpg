import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ReviewQueue } from "./review-queue";

describe("ReviewQueue", () => {
  it("shows teacher review items, suggested score, and decisions", () => {
    render(
      <ReviewQueue
        summary={{ pendingCount: 3, reviewedToday: 8, flaggedCount: 1 }}
        items={[
          {
            submissionId: "submission-1",
            studentName: "Lin",
            guildName: "Morning Forge",
            suggestedScore: 85,
            rationale: "目标清晰，并完成了一轮修正。",
            decision: "approve",
            dayLabel: "Day 1"
          }
        ]}
      />
    );

    expect(screen.getByRole("heading", { name: "老师工作台" })).toBeInTheDocument();
    expect(screen.getByText("待审核 3")).toBeInTheDocument();
    expect(screen.getByText("Lin")).toBeInTheDocument();
    expect(screen.getByText("Morning Forge")).toBeInTheDocument();
    expect(screen.getByText("85")).toBeInTheDocument();
    expect(screen.getByText("approve")).toBeInTheDocument();
    expect(screen.getByText("Day 1")).toBeInTheDocument();
  });
});
