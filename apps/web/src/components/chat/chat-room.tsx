"use client";

import { CSSProperties, useRef, useState } from "react";
import {
  createSubmission,
  type ChatMessage,
  type RoomAccessGrant
} from "../../lib/api-client";
import { toDayLabel, toTimeLabel } from "../../lib/format";
import { loadSession } from "../../lib/session";
import { RoomMessages } from "./room-messages";
import { AccessGrantList } from "./access-grant-list";

/* ────────────────────────────────────────────
   Styles
   ──────────────────────────────────────────── */

const sectionStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "18px",
};

const headerCardStyle: CSSProperties = {
  position: "relative",
  overflow: "hidden",
  background: "linear-gradient(145deg, rgba(18,38,69,.95), rgba(11,19,43,.96))",
  border: "1px solid rgba(125,211,252,.28)",
  borderRadius: "7px",
  padding: "clamp(20px, 4vw, 32px)",
  boxShadow: "0 7px 0 rgba(2,6,23,.5), 0 26px 60px rgba(2,6,23,.22), inset 0 1px 0 rgba(255,255,255,.06)",
};

const headingStyle: CSSProperties = {
  fontSize: "clamp(26px, 5vw, 38px)",
  fontWeight: "800",
  color: "#fff",
  margin: "7px 0 5px",
  letterSpacing: "-0.035em",
  textShadow: "3px 3px 0 rgba(2,6,23,.72)",
};

const subtitleStyle: CSSProperties = {
  fontSize: "14px",
  color: "#94a3b8",
  margin: "0 0 22px",
};

const infoRowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: "9px",
  marginBottom: "18px",
};

const badgeStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "6px",
  background: "rgba(2, 6, 23, 0.34)",
  border: "1px solid rgba(148, 163, 184, 0.16)",
  borderRadius: "4px",
  padding: "7px 10px",
  fontSize: "13px",
  color: "#cbd5e1",
  boxShadow: "inset 2px 0 0 rgba(56,189,248,.6)",
};

const badgeLabelStyle: CSSProperties = {
  color: "#64748b",
  fontSize: "12px",
  fontWeight: 700,
};

const badgeValueStyle: CSSProperties = {
  color: "#fff",
  fontWeight: "700",
  fontSize: "13px",
};

const summaryCardStyle: CSSProperties = {
  background: "rgba(2, 6, 23, 0.3)",
  border: "1px solid rgba(148, 163, 184, 0.14)",
  borderRadius: "5px",
  padding: "15px 17px",
  marginBottom: "18px",
  boxShadow: "inset 3px 0 0 #a78bfa",
};

const summaryLabelStyle: CSSProperties = {
  fontSize: "12px",
  color: "#c4b5fd",
  marginBottom: "6px",
  letterSpacing: "0.12em",
  fontWeight: 800,
};

const summaryTextStyle: CSSProperties = {
  fontSize: "14px",
  color: "#cbd5e1",
  lineHeight: "1.65",
  margin: 0,
};

const submitRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "12px",
  marginTop: "2px",
};

const submitButtonStyle: CSSProperties = {
  minHeight: 42,
  padding: "10px 20px",
  fontSize: "14px",
  fontWeight: "600",
  background: "linear-gradient(180deg, #0ea5e9 0%, #0369a1 100%)",
  border: "1px solid rgba(186,230,253,.65)",
  borderRadius: "4px",
  color: "#fff",
  cursor: "pointer",
  transition: "transform 0.1s, box-shadow 0.2s, opacity 0.2s",
  boxShadow: "0 4px 0 #082f49, 0 10px 24px rgba(14,165,233,.18)",
  letterSpacing: "0.02em",
};

const submitButtonDisabledStyle: CSSProperties = {
  ...submitButtonStyle,
  opacity: 0.6,
  cursor: "not-allowed",
  boxShadow: "none",
};

const feedbackTextStyle: CSSProperties = {
  fontSize: "13px",
  color: "#bae6fd",
  marginTop: "4px",
};

const collabValueStyle: CSSProperties = {
  fontSize: "13px",
  color: "#cbd5e1",
  margin: "16px 0 0",
  padding: "10px 12px",
  background: "rgba(15,23,42,.45)",
  border: "1px dashed rgba(148,163,184,.2)",
  borderRadius: 4,
};

/* ────────────────────────────────────────────
   Component
   ──────────────────────────────────────────── */

type ChatRoomProps = {
  studentName: string;
  viewerRole: "owner" | "guest" | "teacher";
  studentId?: string;
  roomId?: string;
  courseWorldId?: string | null;
  dayId?: string | null;
  agentSessionId?: string | null;
  canSubmit?: boolean;
  agentLabel: string;
  sessionStatusLabel: string;
  sessionSummary: string;
  latestSubmissionStatus: string;
  latestSubmissionMeta?: string;
  accessGrants: RoomAccessGrant[];
  collaborationGuests: Array<{
    studentName: string;
    contributionLabel: string;
  }>;
  messages: ChatMessage[];
};

export function ChatRoom({
  studentName,
  viewerRole,
  studentId = "",
  roomId = "",
  courseWorldId = null,
  dayId = null,
  agentSessionId = null,
  canSubmit = false,
  agentLabel,
  sessionStatusLabel,
  sessionSummary,
  latestSubmissionStatus,
  latestSubmissionMeta,
  accessGrants,
  collaborationGuests,
  messages
}: ChatRoomProps) {
  // F-004: Use the actual logged-in user ID for message ownership,
  // not the studentId (room owner) which may differ for teachers/guests.
  const session = loadSession();
  const loggedInUserId = session?.user.id ?? "";

  const collaborationLabel =
    collaborationGuests.length > 0
      ? collaborationGuests
          .map(
            (guest) => `${guest.studentName}（${guest.contributionLabel}）`
          )
          .join("、")
      : "暂无";
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitFeedback, setSubmitFeedback] = useState<string | null>(null);
  const [currentSubmissionStatus, setCurrentSubmissionStatus] = useState(
    latestSubmissionStatus
  );
  const [currentSubmissionMeta, setCurrentSubmissionMeta] = useState(
    latestSubmissionMeta
  );
  const requestIdRef = useRef<string | null>(null);

  const roomHeading =
    viewerRole === "teacher"
      ? "Teacher 观察"
      : viewerRole === "guest"
        ? "协作聊天室"
        : "个人聊天室";
  const roomSubtitle =
    viewerRole === "teacher"
      ? `旁观 ${studentName} 的房间`
      : viewerRole === "guest"
        ? `${studentName} 的协作房间`
        : `${studentName} 的 Agent 工作间`;
  const viewerLabel =
    viewerRole === "teacher"
      ? "教师只读视角"
      : viewerRole === "guest"
        ? "已授权协作视角"
        : "房主操作视角";

  async function handleSubmit() {
    const timestamp = new Date().toISOString();
    const submitSession = loadSession();

    if (!submitSession) {
      setSubmitFeedback("当前登录已失效，请重新登录。");
      return;
    }
    if (
      viewerRole !== "owner" ||
      !canSubmit ||
      !courseWorldId ||
      !dayId ||
      !agentSessionId
    ) {
      setSubmitFeedback("请先连接本地 Agent，并等待连接状态变为在线。");
      return;
    }

    requestIdRef.current ??= `chat-submit:${
      globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`
    }`;

    setIsSubmitting(true);
    setSubmitFeedback("正在提交到评审队列...");

    try {
      const result = await createSubmission({
        clientRequestId: requestIdRef.current,
        studentId,
        courseWorldId,
        dayId,
        agentSessionId,
        triggerType: "button",
        conversationSummary: sessionSummary,
        workSummary: `${studentName} submitted progress from the chat room for teacher review.`,
        artifacts: [
          {
            kind: "doc",
            label: "聊天室提交快照",
            url: `/chat?roomId=${encodeURIComponent(roomId)}`
          }
        ],
        selfReflection:
          "I summarized the current agent progress and submitted it for teacher review.",
        agentEvaluationHints: ["submitted from chat"],
        timestamp
      }, submitSession.token);

      setCurrentSubmissionStatus("待老师审核");
      setCurrentSubmissionMeta(`${toDayLabel(dayId)} · ${toTimeLabel(timestamp)}`);
      setSubmitFeedback(
        result.queue.status === "waiting_for_queue"
          ? "作业已保存，评审队列暂不可用，等待系统恢复。"
          : "已提交到评审队列。"
      );
      requestIdRef.current = null;
    } catch {
      setSubmitFeedback("提交失败，请稍后重试。");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section style={sectionStyle}>
      {/* ── Header Card ── */}
      <div className="chat-room-hero" style={headerCardStyle}>
        <span aria-hidden="true" style={{ position: "absolute", top: 0, left: 0, width: 88, height: 4, background: "#38bdf8" }} />
        <span aria-hidden="true" style={{ position: "absolute", right: 24, top: 18, fontSize: 58, opacity: .075 }}>▦</span>
        <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
          <span style={{ color: "#7dd3fc", fontSize: 10, fontWeight: 800, letterSpacing: ".18em" }}>ROOM TERMINAL</span>
          <span style={{ padding: "4px 7px", color: viewerRole === "teacher" ? "#fde68a" : viewerRole === "guest" ? "#c4b5fd" : "#86efac", background: "rgba(2,6,23,.35)", border: "1px solid rgba(148,163,184,.16)", borderRadius: 3, fontSize: 10, fontWeight: 700 }}>
            {viewerLabel}
          </span>
        </div>
        <h1 style={headingStyle}>{roomHeading}</h1>
        <p style={subtitleStyle}>{roomSubtitle}</p>

        {/* Agent / Session Info Badges */}
        <div style={infoRowStyle}>
          <span style={badgeStyle}>
            <span style={badgeLabelStyle}>Agent</span>
            <span style={badgeValueStyle}>{agentLabel}</span>
          </span>
          <span style={badgeStyle}>
            <span style={badgeLabelStyle}>会话</span>
            <span style={badgeValueStyle}>会话状态：{sessionStatusLabel}</span>
          </span>
          <span style={badgeStyle}>
            <span style={badgeLabelStyle}>提交</span>
            <span style={badgeValueStyle}>{currentSubmissionStatus}</span>
          </span>
          {currentSubmissionMeta ? (
            <span style={badgeStyle}>
              <span style={badgeValueStyle}>{currentSubmissionMeta}</span>
            </span>
          ) : null}
        </div>

        {/* Session Summary */}
        {sessionSummary ? (
          <div style={summaryCardStyle}>
            <div style={summaryLabelStyle}>会话摘要</div>
            <p style={summaryTextStyle}>{sessionSummary}</p>
          </div>
        ) : null}

        {/* 只有房主且本地 Connector 在线时可以提交。 */}
        {viewerRole === "owner" && canSubmit ? (
          <div>
            <div style={submitRowStyle}>
              <button
                className="chat-primary-action"
                type="button"
                onClick={() => void handleSubmit()}
                disabled={isSubmitting}
                style={isSubmitting ? submitButtonDisabledStyle : submitButtonStyle}
              >
                {isSubmitting ? "提交中..." : "今日提交"}
              </button>
            </div>
            {submitFeedback ? <p role="status" style={feedbackTextStyle}>{submitFeedback}</p> : null}
          </div>
        ) : viewerRole === "owner" ? (
          <p style={feedbackTextStyle}>连接本地 Agent 并保持在线后，才可以提交今日作业。</p>
        ) : null}

        {/* Collaboration Guests */}
        <p style={collabValueStyle}>已授权协作者：{collaborationLabel}</p>
      </div>

      {/* ── Messages ── */}
      <RoomMessages
        roomId={roomId}
        currentUserId={loggedInUserId}
        initialMessages={messages}
        readOnly={viewerRole === "teacher"}
      />

      {/* ── Access Grants ── */}
      {viewerRole === "owner" ? (
        <AccessGrantList roomId={roomId} initialGrants={accessGrants} />
      ) : null}
      <style>{`
        .chat-primary-action:hover:not(:disabled) { filter: brightness(1.12); transform: translateY(-1px); }
        .chat-primary-action:active:not(:disabled) { transform: translateY(2px); box-shadow: 0 2px 0 #082f49 !important; }
        .chat-primary-action:focus-visible { outline: 2px solid #bae6fd; outline-offset: 3px; }
        @media (max-width: 560px) {
          .chat-room-hero { padding: 20px 16px !important; }
        }
        @media (prefers-reduced-motion: reduce) { .chat-primary-action { transition: none !important; } }
      `}</style>
    </section>
  );
}
