"use client";

import { useState } from "react";
import { decideReview, type DecideReviewPayload } from "../../lib/api-client";

type ReviewQueueSummary = {
  pendingCount: number;
  reviewedToday: number;
  flaggedCount: number;
};

type ReviewQueueItem = {
  submissionId: string;
  studentName: string;
  guildName: string;
  dayLabel: string;
  decisionLabel: string;
  finalScore: number;
  submittedAtLabel: string;
  rationale: string;
};

type ReviewQueueProps = {
  summary: ReviewQueueSummary;
  items: ReviewQueueItem[];
};

export function ReviewQueue({ summary, items }: ReviewQueueProps) {
  const [pendingSubmissionId, setPendingSubmissionId] = useState<string | null>(null);
  const [itemOverrides, setItemOverrides] = useState<
    Record<string, { decisionLabel: string; finalScore: number }>
  >({});
  const [actionFeedback, setActionFeedback] = useState<Record<string, string>>({});

  async function handleDecision(
    item: ReviewQueueItem,
    decision: DecideReviewPayload["decision"]
  ) {
    const finalScore = getNextFinalScore(item.finalScore, decision);

    setPendingSubmissionId(item.submissionId);
    setActionFeedback((current) => ({
      ...current,
      [item.submissionId]: "正在提交老师裁定..."
    }));

    try {
      const result = await decideReview({
        submissionId: item.submissionId,
        finalScore,
        decision
      });

      setItemOverrides((current) => ({
        ...current,
        [item.submissionId]: {
          decisionLabel: toDecisionLabel(result.decision),
          finalScore: result.finalScore
        }
      }));
      setActionFeedback((current) => ({
        ...current,
        [item.submissionId]: "老师裁定已同步。"
      }));
    } catch {
      setActionFeedback((current) => ({
        ...current,
        [item.submissionId]: "裁定失败，请稍后重试。"
      }));
    } finally {
      setPendingSubmissionId(null);
    }
  }

  return (
    <section>
      <h1>老师工作台</h1>
      <div>
        <span>待老师裁定 {summary.pendingCount}</span>
        <span>今日已裁定 {summary.reviewedToday}</span>
        <span>需重点关注 {summary.flaggedCount}</span>
      </div>
      <ul>
        {items.map((item) => {
          const override = itemOverrides[item.submissionId];
          const isPending = pendingSubmissionId === item.submissionId;

          return (
            <li key={item.submissionId}>
              <strong>{item.studentName}</strong>
              <p>{item.guildName}</p>
              <p>{item.dayLabel}</p>
              <p>{override?.decisionLabel ?? item.decisionLabel}</p>
              <p>终评分 {override?.finalScore ?? item.finalScore}</p>
              <p>{item.submittedAtLabel}</p>
              <p>{item.rationale}</p>
              <div>
                <button
                  type="button"
                  onClick={() => void handleDecision(item, "approve")}
                  disabled={isPending}
                >
                  通过
                </button>
                <button
                  type="button"
                  onClick={() => void handleDecision(item, "adjust")}
                  disabled={isPending}
                >
                  调整
                </button>
                <button
                  type="button"
                  onClick={() => void handleDecision(item, "reject")}
                  disabled={isPending}
                >
                  驳回
                </button>
              </div>
              {actionFeedback[item.submissionId] ? (
                <p>{actionFeedback[item.submissionId]}</p>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function getNextFinalScore(
  currentFinalScore: number,
  decision: DecideReviewPayload["decision"]
) {
  if (decision === "approve") {
    return currentFinalScore;
  }

  if (decision === "adjust") {
    return Math.max(currentFinalScore - 5, 0);
  }

  return 0;
}

function toDecisionLabel(decision: DecideReviewPayload["decision"]) {
  if (decision === "approve") {
    return "已通过";
  }

  if (decision === "adjust") {
    return "需要调整";
  }

  return "已退回";
}
