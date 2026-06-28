import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { decideReview } from "../../lib/api-client";
import { ReviewQueue } from "./review-queue";

vi.mock("../../lib/api-client", () => ({
  decideReview: vi.fn()
}));

describe("ReviewQueue", () => {
  it("shows teacher review summary and live review items", () => {
    render(
      <ReviewQueue
        summary={{
          pendingCount: 1,
          reviewedToday: 2,
          flaggedCount: 1
        }}
        items={[
          {
            submissionId: "submission-1",
            studentName: "Mo",
            guildName: "Morning Forge",
            dayLabel: "Day 2",
            decisionLabel: "需要调整",
            finalScore: 90,
            submittedAtLabel: "2026-06-29 09:00",
            rationale: "补充工件截图后再进入老师终审。"
          }
        ]}
      />
    );

    expect(screen.getByRole("heading", { name: "老师工作台" })).toBeInTheDocument();
    expect(screen.getByText("待老师裁定 1")).toBeInTheDocument();
    expect(screen.getByText("今日已裁定 2")).toBeInTheDocument();
    expect(screen.getByText("需重点关注 1")).toBeInTheDocument();
    expect(screen.getByText("Mo")).toBeInTheDocument();
    expect(screen.getByText("Morning Forge")).toBeInTheDocument();
    expect(screen.getByText("Day 2")).toBeInTheDocument();
    expect(screen.getByText("需要调整")).toBeInTheDocument();
    expect(screen.getByText("终评分 90")).toBeInTheDocument();
    expect(screen.getByText("补充工件截图后再进入老师终审。")).toBeInTheDocument();
  });

  it("sends an approve decision when the teacher clicks 通过", async () => {
    vi.mocked(decideReview).mockResolvedValue({
      submissionId: "submission-1",
      finalScore: 90,
      decision: "approve"
    });

    render(
      <ReviewQueue
        summary={{
          pendingCount: 1,
          reviewedToday: 0,
          flaggedCount: 0
        }}
        items={[
          {
            submissionId: "submission-1",
            studentName: "Mo",
            guildName: "Morning Forge",
            dayLabel: "Day 2",
            decisionLabel: "待老师裁定",
            finalScore: 90,
            submittedAtLabel: "2026-06-29 09:00",
            rationale: "补充工件截图后再进入老师终审。"
          }
        ]}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "通过" }));

    await waitFor(() => {
      expect(decideReview).toHaveBeenCalledWith({
        submissionId: "submission-1",
        finalScore: 90,
        decision: "approve"
      });
    });
  });
});
