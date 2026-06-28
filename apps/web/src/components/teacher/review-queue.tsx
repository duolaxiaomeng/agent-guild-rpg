type ReviewQueueSummary = {
  currentDayLabel: string;
  completedCount: number;
  activeCount: number;
  lockedCount: number;
};

type ReviewQueueItem = {
  id: string;
  label: string;
  title: string;
  statusLabel: string;
};

type ReviewQueueProps = {
  summary: ReviewQueueSummary;
  items: ReviewQueueItem[];
};

export function ReviewQueue({ summary, items }: ReviewQueueProps) {
  return (
    <section>
      <h1>老师工作台</h1>
      <div>
        <span>当前 Day {summary.currentDayLabel}</span>
        <span>已完成 {summary.completedCount}</span>
        <span>进行中 {summary.activeCount}</span>
        <span>未解锁 {summary.lockedCount}</span>
      </div>
      <ul>
        {items.map((item) => (
          <li key={item.id}>
            <strong>{item.label}</strong>
            <p>{item.title}</p>
            <p>{item.statusLabel}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
