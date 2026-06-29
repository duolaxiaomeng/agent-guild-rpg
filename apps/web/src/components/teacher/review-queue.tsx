"use client";

import { useEffect, useState } from "react";
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

type LocalReviewQueueItem = ReviewQueueItem & {
  currentDecisionLabel: string;
  currentFinalScore: number;
  isPendingTeacherDecision: boolean;
};

type LocalReviewQueueState = {
  summary: ReviewQueueSummary;
  items: LocalReviewQueueItem[];
};

export function ReviewQueue({ summary, items }: ReviewQueueProps) {
  const [pendingSubmissionId, setPendingSubmissionId] = useState<string | null>(null);
  const [queueState, setQueueState] = useState(() => createLocalQueueState(summary, items));
  const [actionFeedback, setActionFeedback] = useState<Record<string, string>>({});

  useEffect(() => {
    setQueueState(createLocalQueueState(summary, items));
  }, [summary, items]);

  async function handleDecision(
    item: LocalReviewQueueItem,
    decision: DecideReviewPayload["decision"]
  ) {
    const finalScore = getNextFinalScore(item.currentFinalScore, decision);

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

      setQueueState((current) => {
        const nextItems = current.items.map((currentItem) => {
          if (currentItem.submissionId !== item.submissionId) {
            return currentItem;
          }

          return {
            ...currentItem,
            currentDecisionLabel: toDecisionLabel(result.decision),
            currentFinalScore: result.finalScore,
            isPendingTeacherDecision: false
          };
        });

        return {
          summary: deriveSummary(nextItems),
          items: nextItems
        };
      });
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
        <span>待老师裁定 {queueState.summary.pendingCount}</span>
        <span>今日已裁定 {queueState.summary.reviewedToday}</span>
        <span>需重点关注 {queueState.summary.flaggedCount}</span>
      </div>
      <ul>
        {queueState.items.map((item) => {
          const isPending = pendingSubmissionId === item.submissionId;

          return (
            <li key={item.submissionId}>
              <strong>{item.studentName}</strong>
              <p>{item.guildName}</p>
              <p>{item.dayLabel}</p>
              <p>{item.currentDecisionLabel}</p>
              <p>终评分 {item.currentFinalScore}</p>
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

function createLocalQueueState(
  summary: ReviewQueueSummary,
  items: ReviewQueueItem[]
): LocalReviewQueueState {
  return {
    summary,
    items: toLocalReviewQueueItems(summary, items)
  };
}

function toLocalReviewQueueItems(
  summary: ReviewQueueSummary,
  items: ReviewQueueItem[]
) {
  let inferredPendingCount = summary.pendingCount;

  return items.map((item) => {
    const isPendingTeacherDecision =
      item.decisionLabel === "待老师裁定" ||
      (item.decisionLabel === "已通过" && inferredPendingCount > 0);

    if (isPendingTeacherDecision) {
      inferredPendingCount -= 1;
    }

    return {
      ...item,
      currentDecisionLabel: isPendingTeacherDecision ? "待老师裁定" : item.decisionLabel,
      currentFinalScore: item.finalScore,
      isPendingTeacherDecision
    };
  });
}

function deriveSummary(items: LocalReviewQueueItem[]): ReviewQueueSummary {
  return {
    pendingCount: items.filter((item) => item.isPendingTeacherDecision).length,
    reviewedToday: items.filter((item) => !item.isPendingTeacherDecision).length,
    flaggedCount: items.filter(
      (item) =>
        item.currentDecisionLabel === "需要调整" || item.currentDecisionLabel === "已退回"
    ).length
  };
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
