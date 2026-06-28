import { DayPanel } from "../../components/quests/day-panel";
import { ReviewQueue } from "../../components/teacher/review-queue";

const dayItems = [
  {
    id: "day-1",
    label: "Day 1",
    title: "首次 Agent 提交",
    status: "completed" as const,
    reward: "全部学生已通过"
  },
  {
    id: "day-2",
    label: "Day 2",
    title: "提示词迭代",
    status: "current" as const,
    reward: "待老师开放互测任务"
  },
  {
    id: "day-3",
    label: "Day 3",
    title: "协作拆解",
    status: "locked" as const,
    reward: "解锁工会挑战"
  }
];

export default function TeacherPage() {
  return (
    <main>
      <ReviewQueue
        summary={{ pendingCount: 3, reviewedToday: 8, flaggedCount: 1 }}
        items={[
          {
            submissionId: "submission-1",
            studentName: "Lin",
            guildName: "Morning Forge",
            suggestedScore: 85,
            rationale: "目标清晰，并完成了一轮修正。",
            decision: "approve",
            dayLabel: "Day 1"
          }
        ]}
      />
      <DayPanel currentDayId="day-2" days={dayItems} />
    </main>
  );
}
