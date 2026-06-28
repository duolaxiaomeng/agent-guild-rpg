type DayStatus = "completed" | "current" | "locked";

type DayItem = {
  id: string;
  label: string;
  title: string;
  status: DayStatus;
  reward: string;
};

type DayPanelProps = {
  currentDayId: string;
  days: DayItem[];
};

function getStatusLabel(status: DayStatus) {
  switch (status) {
    case "completed":
      return "已完成";
    case "current":
      return "当前进度";
    default:
      return "未解锁";
  }
}

export function DayPanel({ currentDayId, days }: DayPanelProps) {
  return (
    <section>
      <h1>Day 关卡面板</h1>
      <ul>
        {days.map((day) => (
          <li key={day.id} aria-current={day.id === currentDayId ? "step" : undefined}>
            <strong>{day.label}</strong>
            <p>{getStatusLabel(day.status)}</p>
            <p>{day.title}</p>
            <p>{day.reward}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
