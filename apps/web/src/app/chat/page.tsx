import { ChatRoom } from "../../components/chat/chat-room";
import { DayPanel } from "../../components/quests/day-panel";
import {
  getChatOverviewSafe,
  getQuestListSafe,
  type ChatOverviewPayload,
  type QuestSummary
} from "../../lib/api-client";

export const dynamic = "force-dynamic";

function toDayLabel(dayId: string) {
  return `Day ${dayId.replace("day-", "")}`;
}

function toDayStatus(status: QuestSummary["status"]) {
  if (status === "completed") {
    return "completed" as const;
  }

  if (status === "open") {
    return "current" as const;
  }

  return "locked" as const;
}

function toRewardText(status: QuestSummary["status"]) {
  if (status === "completed") {
    return "已达成，可进入回顾";
  }

  if (status === "open") {
    return "等待学生完成当日任务";
  }

  return "等待上一关完成后解锁";
}

function toSessionStatusLabel(status: ChatOverviewPayload["sessionStatus"]) {
  if (status === "active") {
    return "进行中";
  }

  if (status === "completed") {
    return "已完成";
  }

  return "异常结束";
}

function toSubmissionMeta(
  latestSubmission: ChatOverviewPayload["latestSubmission"]
) {
  if (!latestSubmission) {
    return undefined;
  }

  return `${latestSubmission.dayLabel} · ${latestSubmission.submittedAt
    .slice(0, 16)
    .replace("T", " ")}`;
}

export default async function ChatPage() {
  const [
    { data: chatOverview, degraded: chatDegraded },
    { data: quests, degraded: questsDegraded }
  ] = await Promise.all([
    getChatOverviewSafe("student-1"),
    getQuestListSafe()
  ]);
  const currentQuest = quests.find((quest) => quest.status === "open") ?? quests[0];
  const dayItems = quests.map((quest) => ({
    id: quest.id,
    label: toDayLabel(quest.id),
    title: quest.title,
    status: toDayStatus(quest.status),
    reward: toRewardText(quest.status)
  }));

  return (
    <main>
      {chatDegraded || questsDegraded ? (
        <p>聊天与关卡数据暂不可达，当前显示安全空态。</p>
      ) : null}
      <ChatRoom
        studentName={chatOverview.studentName}
        agentLabel={chatOverview.agentLabel}
        sessionStatusLabel={toSessionStatusLabel(chatOverview.sessionStatus)}
        sessionSummary={chatOverview.sessionSummary}
        latestSubmissionStatus={
          chatOverview.latestSubmission?.statusLabel ?? "今日未提交"
        }
        latestSubmissionMeta={toSubmissionMeta(chatOverview.latestSubmission)}
        collaborationGuests={chatOverview.collaborationGuests.map((guest) => ({
          studentName: guest.studentName,
          contributionLabel: guest.contributionLabel
        }))}
      />
      <DayPanel currentDayId={currentQuest?.id ?? ""} days={dayItems} />
    </main>
  );
}
