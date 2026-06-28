"use client";

type ChatRoomProps = {
  studentName: string;
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

  return (
    <section>
      <h1>个人聊天室</h1>
      <p>{studentName} 的 Agent 工作间</p>
      <p>
        当前连接 Agent：<span>{agentLabel}</span>
      </p>
      <p>会话状态：{sessionStatusLabel}</p>
      <div>
        <button type="button">今日提交</button>
        <button type="button">授权协作</button>
      </div>
      <p>{sessionSummary}</p>
      <p>
        最新提交状态：<span>{latestSubmissionStatus}</span>
      </p>
      {latestSubmissionMeta ? <p>{latestSubmissionMeta}</p> : null}
      <p>已授权协作者：{collaborationLabel}</p>
    </section>
  );
}
