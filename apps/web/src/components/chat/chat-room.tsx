"use client";

import { useState } from "react";
import {
  createRoomAccessGrant,
  createSubmission,
  revokeRoomAccessGrant,
  type RoomAccessGrant
} from "../../lib/api-client";

type ChatRoomProps = {
  studentName: string;
  studentId?: string;
  roomId?: string;
  courseWorldId?: string;
  dayId?: string;
  agentSessionId?: string;
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
};

export function ChatRoom({
  studentName,
  studentId = "student-1",
  roomId = `room-chat-${studentId}`,
  courseWorldId = "course-world-1",
  dayId = "day-1",
  agentSessionId = "session-1",
  agentLabel,
  sessionStatusLabel,
  sessionSummary,
  latestSubmissionStatus,
  latestSubmissionMeta,
  accessGrants,
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
  const [grantStudentId, setGrantStudentId] = useState("");
  const [grantFeedback, setGrantFeedback] = useState<string | null>(null);
  const [isGrantMutating, setIsGrantMutating] = useState(false);
  const [currentAccessGrants, setCurrentAccessGrants] = useState(accessGrants);

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

  async function handleCreateGrant() {
    const nextGranteeId = grantStudentId.trim();

    if (!nextGranteeId) {
      setGrantFeedback("请输入授权学生 ID。");
      return;
    }

    setIsGrantMutating(true);
    setGrantFeedback("正在创建授权...");

    try {
      const createdGrant = await createRoomAccessGrant({
        roomId,
        granteeId: nextGranteeId,
        scope: "chat_summary",
        expiresInHours: 24
      });

      setCurrentAccessGrants((existingGrants) => [createdGrant, ...existingGrants]);
      setGrantStudentId("");
      setGrantFeedback("授权已创建。");
    } catch {
      setGrantFeedback("授权创建失败，请稍后重试。");
    } finally {
      setIsGrantMutating(false);
    }
  }

  async function handleRevokeGrant(grantId: string) {
    setIsGrantMutating(true);
    setGrantFeedback("正在撤销授权...");

    try {
      const revokedGrant = await revokeRoomAccessGrant(grantId);

      setCurrentAccessGrants((existingGrants) =>
        existingGrants.map((grant) => (grant.id === grantId ? revokedGrant : grant))
      );
      setGrantFeedback("授权已撤销。");
    } catch {
      setGrantFeedback("授权撤销失败，请稍后重试。");
    } finally {
      setIsGrantMutating(false);
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
      <section>
        <h2>授权列表</h2>
        <label>
          授权学生 ID
          <input
            value={grantStudentId}
            onChange={(event) => setGrantStudentId(event.target.value)}
          />
        </label>
        <button
          type="button"
          onClick={() => void handleCreateGrant()}
          disabled={isGrantMutating}
        >
          创建授权
        </button>
        {grantFeedback ? <p>{grantFeedback}</p> : null}
        {currentAccessGrants.length > 0 ? (
          <ul>
            {currentAccessGrants.map((grant) => (
              <li key={grant.id}>
                <span>{toGrantLabel(grant)}</span>
                {grant.status === "approved" ? (
                  <button
                    type="button"
                    onClick={() => void handleRevokeGrant(grant.id)}
                    disabled={isGrantMutating}
                  >
                    {`撤销 ${grant.granteeName}`}
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p>暂无授权记录。</p>
        )}
      </section>
    </section>
  );
}

function toDayLabel(dayId: string) {
  return `Day ${dayId.replace("day-", "")}`;
}

function toTimeLabel(timestamp: string) {
  return timestamp.slice(0, 16).replace("T", " ");
}

function toGrantStatusLabel(status: RoomAccessGrant["status"]) {
  return status === "revoked" ? "已撤销" : "生效中";
}

function toGrantLabel(grant: RoomAccessGrant) {
  return `${grant.granteeName} · ${grant.scope} · ${toGrantStatusLabel(grant.status)}`;
}
