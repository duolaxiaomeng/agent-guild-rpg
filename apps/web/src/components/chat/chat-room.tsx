"use client";

type ChatRoomProps = {
  studentName: string;
  agentLabel: string;
  sessionSummary: string;
  latestSubmissionStatus: string;
  collaborationGuests: string[];
};

export function ChatRoom({
  studentName,
  agentLabel,
  sessionSummary,
  latestSubmissionStatus,
  collaborationGuests
}: ChatRoomProps) {
  return (
    <section>
      <h1>个人聊天室</h1>
      <p>{studentName} 的 Agent 工作间</p>
      <p>
        当前连接 Agent：<span>{agentLabel}</span>
      </p>
      <div>
        <button type="button">今日提交</button>
        <button type="button">授权协作</button>
      </div>
      <p>{sessionSummary}</p>
      <p>
        最新提交状态：<span>{latestSubmissionStatus}</span>
      </p>
      <p>已授权协作者：{collaborationGuests.join("、")}</p>
    </section>
  );
}
