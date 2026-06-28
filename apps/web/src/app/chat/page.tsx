import { ChatRoom } from "../../components/chat/chat-room";
import { DayPanel } from "../../components/quests/day-panel";

const dayItems = [
  {
    id: "day-1",
    label: "Day 1",
    title: "首次 Agent 提交",
    status: "completed" as const,
    reward: "解锁工会申请"
  },
  {
    id: "day-2",
    label: "Day 2",
    title: "提示词迭代",
    status: "current" as const,
    reward: "开放互测任务"
  },
  {
    id: "day-3",
    label: "Day 3",
    title: "协作拆解",
    status: "locked" as const,
    reward: "解锁工会任务板"
  }
];

export default function ChatPage() {
  return (
    <main>
      <ChatRoom
        studentName="Lin"
        agentLabel="Claude Code"
        sessionSummary="已完成 README 更新、截图整理和提示词修正。"
        latestSubmissionStatus="待老师审核"
        collaborationGuests={["Mia", "Noah"]}
      />
      <DayPanel currentDayId="day-2" days={dayItems} />
    </main>
  );
}
