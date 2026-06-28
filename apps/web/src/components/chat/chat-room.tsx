"use client";

import { useState } from "react";
import { createSubmission } from "../../lib/api-client";

type ChatRoomProps = {
  studentName: string;
  studentId?: string;
  courseWorldId?: string;
  dayId?: string;
  agentSessionId?: string;
  agentLabel: string;
  sessionStatusLabel: string;
  sessionSummary: string;
  latestSubmissionStatus: string;
  latestSubmissionMeta?: string;
  collaborationGuests: Array<{
    studentName: string;
    contributionLabel: string;
  }>;
};

export function ChatRoom({
  studentName,
  studentId = "student-1",
  courseWorldId = "course-world-1",
  dayId = "day-1",
  agentSessionId = "session-1",
  agentLabel,
  sessionStatusLabel,
  sessionSummary,
  latestSubmissionStatus,
  latestSubmissionMeta,
  collaborationGuests
}: ChatRoomProps) {
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

  async function handleSubmit() {
    const timestamp = new Date().toISOString();

    setIsSubmitting(true);
    setSubmitFeedback("正在提交到评审队列...");

    try {
      await createSubmission({
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
            label: "Chat Summary",
            url: `https://example.com/submissions/${studentId}/${dayId}`
          }
        ],
        selfReflection:
          "I summarized the current agent progress and submitted it for teacher review.",
        agentEvaluationHints: ["submitted from chat"],
        timestamp
      });

      setCurrentSubmissionStatus("待老师审核");
      setCurrentSubmissionMeta(`${toDayLabel(dayId)} · ${toTimeLabel(timestamp)}`);
      setSubmitFeedback("已提交到评审队列。");
    } catch {
      setSubmitFeedback("提交失败，请稍后重试。");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section>
      <h1>个人聊天室</h1>
      <p>{studentName} 的 Agent 工作间</p>
      <p>
        当前连接 Agent：<span>{agentLabel}</span>
      </p>
      <p>会话状态：{sessionStatusLabel}</p>
      <div>
        <button type="button" onClick={() => void handleSubmit()} disabled={isSubmitting}>
          {isSubmitting ? "提交中..." : "今日提交"}
        </button>
        <button type="button">授权协作</button>
      </div>
      {submitFeedback ? <p>{submitFeedback}</p> : null}
      <p>{sessionSummary}</p>
      <p>
        最新提交状态：<span>{currentSubmissionStatus}</span>
      </p>
      {currentSubmissionMeta ? <p>{currentSubmissionMeta}</p> : null}
      <p>已授权协作者：{collaborationLabel}</p>
    </section>
  );
}

function toDayLabel(dayId: string) {
  return `Day ${dayId.replace("day-", "")}`;
}

function toTimeLabel(timestamp: string) {
  return timestamp.slice(0, 16).replace("T", " ");
}
