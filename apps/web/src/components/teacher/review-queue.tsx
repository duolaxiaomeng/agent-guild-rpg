"use client";

import { CSSProperties, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  decideReview,
  getSubmissionDetail,
  type DecideReviewPayload,
  type SubmissionDetail
} from "../../lib/api-client";
import { loadSession } from "../../lib/session";

type ReviewQueueSummary = {
  pendingCount: number;
  queuedCount?: number;
  pendingTeacherDecisionCount?: number;
  reviewedToday: number;
  flaggedCount: number;
};

type ReviewQueueItem = {
  submissionId: string;
  studentName: string;
  guildName: string;
  dayLabel: string;
  decisionLabel: string;
  reviewStatus?: "queued" | "ai_reviewed" | "needs_teacher" | "teacher_decided";
  isPendingTeacherDecision: boolean;
  finalScore: number | null;
  suggestedScore?: number | null;
  decision?: "approve" | "adjust" | "reject" | null;
  submittedAtLabel: string;
  rationale: string;
};

type ReviewQueueProps = {
  summary: ReviewQueueSummary;
  items: ReviewQueueItem[];
  pagination?: { page: number; pageSize: number; total: number };
};

type LocalReviewQueueItem = ReviewQueueItem & {
  currentDecisionLabel: string;
  currentFinalScore: number | null;
  currentDecision: "approve" | "adjust" | "reject" | null;
  isPendingTeacherDecision: boolean;
  decidedAt: string | null;
};

type LocalReviewQueueState = {
  summary: ReviewQueueSummary;
  items: LocalReviewQueueItem[];
};

export function ReviewQueue({
  summary,
  items,
  pagination = { page: 1, pageSize: 50, total: items.length }
}: ReviewQueueProps) {
  const router = useRouter();
  const [pendingSubmissionId, setPendingSubmissionId] = useState<string | null>(null);
  const [queueState, setQueueState] = useState(() => createLocalQueueState(summary, items));
  const [actionFeedback, setActionFeedback] = useState<Record<string, string>>({});
  const [details, setDetails] = useState<Record<string, SubmissionDetail>>({});
  const [detailLoadingId, setDetailLoadingId] = useState<string | null>(null);

  useEffect(() => {
    setQueueState(createLocalQueueState(summary, items));
  }, [summary, items]);

  async function handleDecision(
    item: LocalReviewQueueItem,
    decision: DecideReviewPayload["decision"]
  ) {
    const session = loadSession();
    const finalScore = getNextFinalScore(item.suggestedScore ?? null, item.currentFinalScore, decision);

    if (!session) {
      setActionFeedback((current) => ({
        ...current,
        [item.submissionId]: "当前登录已失效，请重新登录。"
      }));
      return;
    }

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
      }, session.token);

      setQueueState((current) => {
        const nextItems = current.items.map((currentItem) => {
          if (currentItem.submissionId !== item.submissionId) {
            return currentItem;
          }

          return {
            ...currentItem,
            currentDecisionLabel: toDecisionLabel(result.decision),
            currentFinalScore: result.finalScore,
            currentDecision: result.decision,
            isPendingTeacherDecision: false,
            decidedAt: new Date().toISOString()
          };
        });

        return { summary: current.summary, items: nextItems };
      });
      setActionFeedback((current) => ({
        ...current,
        [item.submissionId]: "老师裁定已同步。"
      }));
      router.refresh();
    } catch {
      setActionFeedback((current) => ({
        ...current,
        [item.submissionId]: "裁定失败，请稍后重试。"
      }));
    } finally {
      setPendingSubmissionId(null);
    }
  }

  async function handleDetail(submissionId: string) {
    if (details[submissionId]) {
      setDetails((current) => {
        const next = { ...current };
        delete next[submissionId];
        return next;
      });
      return;
    }
    const session = loadSession();
    if (!session) return;
    setDetailLoadingId(submissionId);
    try {
      const detail = await getSubmissionDetail(submissionId, session.token);
      setDetails((current) => ({ ...current, [submissionId]: detail }));
    } catch {
      setActionFeedback((current) => ({
        ...current,
        [submissionId]: "作业详情加载失败，请稍后重试。"
      }));
    } finally {
      setDetailLoadingId(null);
    }
  }

  const queuedCount = queueState.summary.queuedCount ?? 0;
  const pendingTeacherDecisionCount = queueState.summary.pendingTeacherDecisionCount ?? queueState.summary.pendingCount;
  const summaryCards: { text: string; value: number; color: string; bg: string }[] = [
    { text: `AI评审中 ${queuedCount}`, value: queuedCount, color: "#60a5fa", bg: "rgba(96,165,250,0.1)" },
    { text: `待老师裁定 ${pendingTeacherDecisionCount}`, value: pendingTeacherDecisionCount, color: "#6366f1", bg: "rgba(99,102,241,0.1)" },
    { text: `今日已裁定 ${queueState.summary.reviewedToday}`, value: queueState.summary.reviewedToday, color: "#4ade80", bg: "rgba(74,222,128,0.1)" },
    { text: `需重点关注 ${queueState.summary.flaggedCount}`, value: queueState.summary.flaggedCount, color: "#fbbf24", bg: "rgba(251,191,36,0.1)" },
  ];

  return (
    <section style={sectionStyle}>
      <div style={sectionHeaderStyle}>
        <div>
          <span style={eyebrowStyle}>REVIEW OPERATIONS</span>
          <h2 style={sectionTitleStyle}>评审队列</h2>
        </div>
        <span style={queueCountBadgeStyle}>{queueState.items.length} 份提交</span>
      </div>

      {/* Summary cards */}
      <div style={summaryGridStyle}>
        {summaryCards.map((card) => (
          <div
            key={card.text}
            style={{
              ...summaryCardStyle,
              background: `linear-gradient(145deg, ${card.bg}, rgba(7,13,28,0.42))`,
              borderColor: `${card.color}40`,
              borderTopColor: card.color,
            }}
          >
            <span aria-hidden="true" style={{ ...summaryDotStyle, background: card.color, boxShadow: `0 0 12px ${card.color}55` }} />
            <span
              style={{
                fontFamily: "var(--font-pixel)",
                fontSize: "clamp(12px, 2vw, 14px)",
                fontWeight: "800",
                color: card.color,
                lineHeight: 1.35,
                display: "block",
              }}
            >
              {card.text}
            </span>
          </div>
        ))}
      </div>

      {/* Review list */}
      <ul style={reviewListStyle}>
        {queueState.items.map((item) => {
          const isPending = pendingSubmissionId === item.submissionId;
          const statusTone = item.reviewStatus === "queued"
            ? "#64b7ff"
            : item.isPendingTeacherDecision
              ? "#f8bd58"
              : item.currentDecision === "approve"
                ? "#50d6ba"
                : item.currentDecision === "reject"
                  ? "#ff6b7d"
                  : "#9aafff";

          return (
            <li
              key={item.submissionId}
              style={{
                ...reviewItemStyle,
                borderLeftColor: statusTone,
              }}
            >
              <div style={reviewItemHeaderStyle}>
                <div>
                  <span style={submissionLabelStyle}>SUBMISSION / {item.submissionId}</span>
                  <strong style={studentNameStyle}>{item.studentName}</strong>
                </div>
                <span
                  style={{
                    ...statusBadgeStyle,
                    color: statusTone,
                    borderColor: `${statusTone}55`,
                    background: `${statusTone}14`,
                  }}
                >
                  <span aria-hidden="true">●</span>
                  {item.currentDecisionLabel}
                </span>
              </div>

              <div style={metadataStyle}>
                <span style={metadataChipStyle}>{item.guildName}</span>
                <span style={metadataChipStyle}>{item.dayLabel}</span>
                <span style={{ ...metadataChipStyle, color: "#e6ebf6" }}>{toScoreLabel(item.currentFinalScore)}</span>
                <span style={metadataChipStyle}>{item.submittedAtLabel}</span>
              </div>

              <p style={rationaleStyle}>
                {item.rationale}
              </p>

              <div style={decisionRowStyle}>
                <DecisionButton
                  label={details[item.submissionId] ? "收起作业" : "查看作业"}
                  color="#64b7ff"
                  onClick={() => void handleDetail(item.submissionId)}
                  disabled={detailLoadingId === item.submissionId}
                />
                <DecisionButton
                  label="通过"
                  color="#4ade80"
                  onClick={() => void handleDecision(item, "approve")}
                  disabled={isPending || !item.isPendingTeacherDecision}
                />
                <DecisionButton
                  label="调整"
                  color="#fbbf24"
                  onClick={() => void handleDecision(item, "adjust")}
                  disabled={isPending || !item.isPendingTeacherDecision}
                />
                <DecisionButton
                  label="驳回"
                  color="#f87171"
                  onClick={() => void handleDecision(item, "reject")}
                  disabled={isPending || !item.isPendingTeacherDecision}
                />
              </div>

              {details[item.submissionId] ? (
                <SubmissionDetailPanel detail={details[item.submissionId]} />
              ) : null}

              {actionFeedback[item.submissionId] ? (
                <p role="status" style={{ ...feedbackStyle, color: actionFeedback[item.submissionId].includes("失败") || actionFeedback[item.submissionId].includes("失效") ? "#ff9aa8" : "#8ce7d5" }}>
                  {actionFeedback[item.submissionId]}
                </p>
              ) : null}
            </li>
          );
        })}
        {queueState.items.length === 0 ? (
          <li style={emptyStateStyle}>
            <strong style={{ color: "#d9e2f3" }}>评审队列已清空</strong>
            <span style={{ color: "#8998b5", fontSize: 12 }}>新的学生提交会在这里等待处理。</span>
          </li>
        ) : null}
      </ul>
      <nav aria-label="评审分页" style={{ display: "flex", justifyContent: "space-between", marginTop: 14 }}>
        <a
          href={`?reviewPage=${Math.max(1, pagination.page - 1)}`}
          aria-disabled={pagination.page <= 1}
          style={{ ...metadataChipStyle, pointerEvents: pagination.page <= 1 ? "none" : "auto", opacity: pagination.page <= 1 ? .45 : 1 }}
        >
          上一页
        </a>
        <span style={metadataChipStyle}>
          第 {pagination.page} 页 · 共 {pagination.total} 份
        </span>
        <a
          href={`?reviewPage=${pagination.page + 1}`}
          aria-disabled={pagination.page * pagination.pageSize >= pagination.total}
          style={{ ...metadataChipStyle, pointerEvents: pagination.page * pagination.pageSize >= pagination.total ? "none" : "auto", opacity: pagination.page * pagination.pageSize >= pagination.total ? .45 : 1 }}
        >
          下一页
        </a>
      </nav>
    </section>
  );
}

function SubmissionDetailPanel({ detail }: { detail: SubmissionDetail }) {
  return (
    <div style={{ ...rationaleStyle, marginTop: 12 }}>
      <strong style={{ color: "#fff" }}>作业内容</strong>
      <p>提交时间：{detail.submission.timestamp}</p>
      <p>会话摘要：{detail.submission.conversationSummary}</p>
      <p>工作摘要：{detail.submission.workSummary}</p>
      <p>个人复盘：{detail.submission.selfReflection}</p>
      <ul>
        {detail.submission.artifacts.map((artifact) => (
          <li key={`${artifact.kind}-${artifact.url}`}>
            <a href={artifact.url} target="_blank" rel="noreferrer">{artifact.label}</a>
          </li>
        ))}
      </ul>
      <p>Agent 事件证据：{detail.agentEvents.length} 条</p>
      {detail.agentEvents.slice(0, 10).map((event) => (
        <div key={event.eventId}>{event.type} · {event.occurredAt}</div>
      ))}
      <p>
        评审记录：{detail.review
          ? `${detail.review.status} · ${detail.review.rationale}`
          : "尚未生成"}
      </p>
    </div>
  );
}

function DecisionButton({
  label,
  color,
  onClick,
  disabled,
}: {
  label: string;
  color: string;
  onClick: () => void;
  disabled: boolean;
}) {
  const [hovered, setHovered] = useState(false);
  const style: CSSProperties = {
    flex: "1 1 88px",
    minHeight: 38,
    padding: "8px 14px",
    fontSize: "13px",
    fontWeight: "800",
    color: disabled ? "rgba(255,255,255,0.25)" : color,
    background: disabled ? "rgba(255,255,255,0.04)" : hovered ? `${color}20` : `${color}14`,
    border: `1px solid ${disabled ? "rgba(255,255,255,0.08)" : `${color}55`}`,
    borderRadius: "5px",
    cursor: disabled ? "not-allowed" : "pointer",
    boxShadow: disabled ? "none" : "0 2px 0 rgba(3,6,14,0.42)",
    transition: "background 0.15s, border-color 0.15s, transform 0.15s",
    opacity: disabled ? 0.5 : 1,
  };
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={style}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {label}
    </button>
  );
}

function createLocalQueueState(
  summary: ReviewQueueSummary,
  items: ReviewQueueItem[]
): LocalReviewQueueState {
  return {
    summary,
    items: toLocalReviewQueueItems(items)
  };
}

function toLocalReviewQueueItems(items: ReviewQueueItem[]) {
  return items.map((item) => {
    return {
        ...item,
      currentDecisionLabel: item.isPendingTeacherDecision ? "待老师裁定" : item.decisionLabel,
      currentFinalScore: item.finalScore,
      currentDecision: item.decision ?? null,
      isPendingTeacherDecision: item.isPendingTeacherDecision,
      decidedAt: null as string | null
    };
  });
}

function deriveSummary(items: LocalReviewQueueItem[], reviewedToday: number): ReviewQueueSummary {
  return {
    pendingCount: items.filter((item) => item.reviewStatus === "queued" || item.isPendingTeacherDecision).length,
    queuedCount: items.filter((item) => item.reviewStatus === "queued").length,
    pendingTeacherDecisionCount: items.filter((item) => item.isPendingTeacherDecision).length,
    reviewedToday,
    // F-015: Use decision enum instead of Chinese string matching
    flaggedCount: items.filter(
      (item) => item.currentDecision === "adjust" || item.currentDecision === "reject"
    ).length
  };
}

function getNextFinalScore(
  suggestedScore: number | null,
  currentFinalScore: number | null,
  decision: DecideReviewPayload["decision"]
) {
  // F-003: Use suggestedScore as the base for approve/adjust decisions
  // instead of falling back to 0 when no finalScore exists
  const baseScore = suggestedScore ?? currentFinalScore ?? 0;

  if (decision === "approve") {
    return baseScore;
  }

  if (decision === "adjust") {
    return Math.max(baseScore - 5, 0);
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

function toScoreLabel(score: number | null) {
  if (score == null) {
    return "终评分 待生成";
  }

  return `终评分 ${score}`;
}

const sectionStyle: CSSProperties = { marginTop: 24, padding: "clamp(18px, 3vw, 24px)", border: "1px solid rgba(150,178,221,0.2)", borderRadius: 12, background: "rgba(12,23,45,0.78)", boxShadow: "0 5px 0 rgba(3,6,14,0.42)" };
const sectionHeaderStyle: CSSProperties = { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, marginBottom: 18 };
const eyebrowStyle: CSSProperties = { display: "block", color: "#8998b5", fontFamily: "var(--font-pixel)", fontSize: 9, fontWeight: 800, letterSpacing: "0.12em" };
const sectionTitleStyle: CSSProperties = { margin: "3px 0 0", color: "#fff", fontFamily: "var(--font-pixel)", fontSize: 20, fontWeight: 900 };
const queueCountBadgeStyle: CSSProperties = { padding: "4px 9px", border: "1px solid rgba(154,175,255,0.34)", borderRadius: 999, background: "rgba(118,146,255,0.1)", color: "#cdd7ff", fontSize: 11, fontWeight: 800, whiteSpace: "nowrap" };
const summaryGridStyle: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(145px, 1fr))", gap: 10, marginBottom: 20 };
const summaryCardStyle: CSSProperties = { position: "relative", display: "flex", minHeight: 70, alignItems: "center", gap: 10, padding: "14px 14px", border: "1px solid", borderTop: "3px solid", borderRadius: 6, boxShadow: "inset 0 1px rgba(255,255,255,0.03)" };
const summaryDotStyle: CSSProperties = { width: 8, height: 8, flex: "0 0 8px", borderRadius: 2 };
const reviewListStyle: CSSProperties = { display: "grid", gap: 12, margin: 0, padding: 0, listStyle: "none" };
const reviewItemStyle: CSSProperties = { padding: "clamp(16px, 3vw, 21px)", border: "1px solid rgba(150,178,221,0.18)", borderLeft: "4px solid", borderRadius: 7, background: "linear-gradient(145deg, rgba(27,43,76,0.72), rgba(12,23,45,0.74))", boxShadow: "0 3px 0 rgba(3,6,14,0.36)" };
const reviewItemHeaderStyle: CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 10, marginBottom: 12 };
const submissionLabelStyle: CSSProperties = { display: "block", marginBottom: 3, maxWidth: "min(58vw, 420px)", overflow: "hidden", color: "#7183a4", fontFamily: "var(--font-pixel)", fontSize: 9, letterSpacing: "0.06em", textOverflow: "ellipsis", whiteSpace: "nowrap" };
const studentNameStyle: CSSProperties = { color: "#fff", fontFamily: "var(--font-pixel)", fontSize: 16, fontWeight: 900 };
const statusBadgeStyle: CSSProperties = { display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 8px", border: "1px solid", borderRadius: 999, fontSize: 11, fontWeight: 800, whiteSpace: "nowrap" };
const metadataStyle: CSSProperties = { display: "flex", flexWrap: "wrap", gap: 7, marginBottom: 10 };
const metadataChipStyle: CSSProperties = { padding: "3px 7px", border: "1px solid rgba(150,178,221,0.15)", borderRadius: 4, background: "rgba(5,11,24,0.26)", color: "#9ba9c1", fontSize: 11 };
const rationaleStyle: CSSProperties = { margin: "0 0 15px", padding: "11px 12px", borderLeft: "2px solid rgba(154,175,255,0.28)", background: "rgba(5,11,24,0.2)", color: "#aebbd3", fontSize: 13, lineHeight: 1.55 };
const decisionRowStyle: CSSProperties = { display: "flex", flexWrap: "wrap", gap: 8 };
const feedbackStyle: CSSProperties = { margin: "10px 0 0", fontSize: 12, fontWeight: 700 };
const emptyStateStyle: CSSProperties = { display: "grid", justifyItems: "center", gap: 5, padding: "28px 16px", border: "1px dashed rgba(150,178,221,0.24)", borderRadius: 7, background: "rgba(5,11,24,0.2)", textAlign: "center" };
