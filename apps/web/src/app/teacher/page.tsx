import { DayPanel } from "../../components/quests/day-panel";
import { ReviewQueue } from "../../components/teacher/review-queue";
import { getQuestList, type QuestSummary } from "../../lib/api-client";

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

export default async function TeacherPage() {
  const quests = await getQuestList();
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
      <ReviewQueue
        summary={{
          currentDayLabel: currentQuest ? toDayLabel(currentQuest.id) : "暂无任务",
          completedCount: quests.filter((quest) => quest.status === "completed").length,
          activeCount: quests.filter((quest) => quest.status === "open").length,
          lockedCount: quests.filter((quest) => quest.status === "locked").length
        }}
        items={quests.map((quest) => ({
          id: quest.id,
          label: toDayLabel(quest.id),
          title: quest.title,
          statusLabel:
            quest.status === "completed"
              ? "已完成"
              : quest.status === "open"
                ? "进行中"
                : "未解锁"
        }))}
      />
      <DayPanel currentDayId={currentQuest?.id ?? ""} days={dayItems} />
    </main>
  );
}
