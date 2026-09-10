import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { decideReview, getSubmissionDetail } from "../../lib/api-client";
import { ReviewQueue } from "./review-queue";

vi.mock("../../lib/api-client", () => ({
  decideReview: vi.fn(),
  getSubmissionDetail: vi.fn()
}));

const refreshMock = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: refreshMock })
}));

describe("ReviewQueue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.setItem(
      "agent-guild-session",
      JSON.stringify({
        token: "session_teacher-1",
        user: {
          id: "teacher-1",
          role: "teacher",
          displayName: "Teacher Lin"
        }
      })
    );
  });

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
            reviewStatus: "teacher_decided",
            isPendingTeacherDecision: false,
            finalScore: 90,
            submittedAtLabel: "2026-06-29 09:00",
            rationale: "补充工件截图后再进入老师终审。"
          }
        ]}
      />
    );

    expect(screen.getByRole("heading", { name: "评审队列" })).toBeInTheDocument();
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

  it("renders queued AI work separately from teacher decisions", () => {
    render(
      <ReviewQueue
        summary={{
          pendingCount: 2,
          queuedCount: 1,
          pendingTeacherDecisionCount: 1,
          reviewedToday: 0,
          flaggedCount: 0
        }}
        items={[
          {
            submissionId: "queued-1",
            studentName: "Lin",
            guildName: "Morning Forge",
            dayLabel: "Day 1",
            decisionLabel: "AI评审中",
            reviewStatus: "queued",
            isPendingTeacherDecision: false,
            finalScore: null,
            suggestedScore: null,
            decision: null,
            submittedAtLabel: "刚刚",
            rationale: "AI review queued."
          }
        ]}
      />
    );

    expect(screen.getByText("AI评审中 1")).toBeInTheDocument();
    expect(screen.getByText("待老师裁定 1")).toBeInTheDocument();
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
            reviewStatus: "ai_reviewed",
            isPendingTeacherDecision: true,
            finalScore: 90,
            submittedAtLabel: "2026-06-29 09:00",
            rationale: "补充工件截图后再进入老师终审。"
          }
        ]}
      />
    );

    expect(screen.getByText("待老师裁定")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "通过" }));

    await waitFor(() => {
      expect(decideReview).toHaveBeenCalledWith({
        submissionId: "submission-1",
        finalScore: 90,
        decision: "approve"
      }, "session_teacher-1");
    });

    await waitFor(() => {
      expect(screen.getByText("已通过")).toBeInTheDocument();
      expect(screen.getByText("老师裁定已同步。")).toBeInTheDocument();
      expect(refreshMock).toHaveBeenCalled();
    });
  });

  it("recomputes summary and item state when the teacher adjusts a pending review", async () => {
    vi.mocked(decideReview).mockResolvedValue({
      submissionId: "submission-1",
      finalScore: 85,
      decision: "adjust"
    });

    render(
      <ReviewQueue
        summary={{
          pendingCount: 1,
          reviewedToday: 1,
          flaggedCount: 0
        }}
        items={[
          {
            submissionId: "submission-1",
            studentName: "Mo",
            guildName: "Morning Forge",
            dayLabel: "Day 2",
            decisionLabel: "待老师裁定",
            reviewStatus: "ai_reviewed",
            isPendingTeacherDecision: true,
            finalScore: 90,
            submittedAtLabel: "2026-06-29 09:00",
            rationale: "补充工件截图后再进入老师终审。"
          },
          {
            submissionId: "submission-2",
            studentName: "Lin",
            guildName: "Morning Forge",
            dayLabel: "Day 1",
            decisionLabel: "已通过",
            reviewStatus: "teacher_decided",
            isPendingTeacherDecision: false,
            finalScore: 95,
            submittedAtLabel: "2026-06-29 08:00",
            rationale: "证据完整，可进入下一关。"
          }
        ]}
      />
    );

    expect(screen.getByText("待老师裁定")).toBeInTheDocument();

    const targetItem = screen.getByText("Mo").closest("li");

    expect(targetItem).not.toBeNull();

    fireEvent.click(within(targetItem as HTMLLIElement).getByRole("button", { name: "调整" }));

    await waitFor(() => {
      expect(decideReview).toHaveBeenCalledWith({
        submissionId: "submission-1",
        finalScore: 85,
        decision: "adjust"
      }, "session_teacher-1");
    });

    await waitFor(() => {
      expect(screen.getByText("需要调整")).toBeInTheDocument();
      expect(screen.getByText("终评分 85")).toBeInTheDocument();
      expect(refreshMock).toHaveBeenCalled();
    });
  });

  it("loads and displays the complete submission detail", async () => {
    vi.mocked(getSubmissionDetail).mockResolvedValue({
      submission: {
        id: "submission-1",
        clientRequestId: "request-1",
        studentId: "student-1",
        studentName: "Lin",
        courseWorldId: "course-world-1",
        dayId: "day-1",
        dayTitle: "First Agent Session",
        agentSessionId: "session-1",
        agentProvider: "codex",
        agentSessionStatus: "active",
        triggerType: "button",
        conversationSummary: "Student compared the expected result and corrected the prompt.",
        workSummary: "Student completed the Agent website and attached evidence.",
        artifacts: [{ kind: "demo", label: "演示", url: "/artifacts/demo" }],
        selfReflection: "I learned how to define acceptance criteria before implementation.",
        agentEvaluationHints: ["verified"],
        timestamp: "2026-07-14T00:00:00.000Z"
      },
      review: {
        submissionId: "submission-1",
        status: "needs_teacher",
        suggestedScore: null,
        finalScore: null,
        decision: null,
        rationale: "AI processing failed and requires teacher handling.",
        riskFlags: ["ai_failed"],
        reviewerName: null,
        aiReviewedAt: null,
        decidedAt: null
      },
      agentEvents: [
        {
          eventId: "event-1",
          type: "task.completed",
          payload: {},
          occurredAt: "2026-07-14T00:00:00.000Z"
        }
      ]
    });
    render(
      <ReviewQueue
        summary={{ pendingCount: 1, reviewedToday: 0, flaggedCount: 0 }}
        items={[{
          submissionId: "submission-1",
          studentName: "Lin",
          guildName: "Morning Forge",
          dayLabel: "Day 1",
          decisionLabel: "待老师裁定",
          reviewStatus: "needs_teacher",
          isPendingTeacherDecision: true,
          finalScore: null,
          suggestedScore: null,
          decision: null,
          submittedAtLabel: "刚刚",
          rationale: "AI processing failed."
        }]}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "查看作业" }));
    expect(
      await screen.findByText(/Student completed the Agent website and attached evidence\./)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/task\.completed · 2026-07-14T00:00:00\.000Z/)
    ).toBeInTheDocument();
    expect(screen.getByText(/提交时间：2026-07-14T00:00:00\.000Z/)).toBeInTheDocument();
    expect(screen.getByText(/评审记录：needs_teacher/)).toBeInTheDocument();
  });
});
