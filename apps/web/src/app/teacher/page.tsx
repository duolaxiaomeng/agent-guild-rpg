import { DayPanel } from "../../components/quests/day-panel";
import { ReviewQueue } from "../../components/teacher/review-queue";
import {
  getQuestListSafe,
  getReviewQueueSafe,
  type QuestSummary,
  type ReviewQueueItem
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

function toDecisionLabel(decision: ReviewQueueItem["decision"]) {
  if (decision === "approve") {
    return "已通过";
  }

  if (decision === "adjust") {
    return "需要调整";
  }

  return "已退回";
}

function toSubmittedAtLabel(submittedAt: string) {
  return submittedAt.slice(0, 16).replace("T", " ");
}

export default async function TeacherPage() {
  const [
    { data: quests, degraded: questsDegraded },
    { data: reviewQueue, degraded: reviewQueueDegraded }
  ] = await Promise.all([getQuestListSafe(), getReviewQueueSafe()]);
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
      {questsDegraded || reviewQueueDegraded ? (
        <p>评审与关卡数据暂不可达，当前显示安全空态。</p>
      ) : null}
      <ReviewQueue
        summary={reviewQueue.summary}
        items={reviewQueue.items.map((item) => ({
          submissionId: item.submissionId,
          studentName: item.studentName,
          guildName: item.guildName,
          dayLabel: item.dayLabel,
          decisionLabel: toDecisionLabel(item.decision),
          finalScore: item.finalScore,
          submittedAtLabel: toSubmittedAtLabel(item.submittedAt),
          rationale: item.rationale
        }))}
      />
      <DayPanel currentDayId={currentQuest?.id ?? ""} days={dayItems} />
    </main>
  );
}
