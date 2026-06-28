type ReviewQueueSummary = {
  pendingCount: number;
  reviewedToday: number;
  flaggedCount: number;
};

type ReviewQueueItem = {
  submissionId: string;
  studentName: string;
  guildName: string;
  suggestedScore: number;
  rationale: string;
  decision: string;
  dayLabel: string;
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
        <span>待审核 {summary.pendingCount}</span>
        <span>今日已审 {summary.reviewedToday}</span>
        <span>风险标记 {summary.flaggedCount}</span>
      </div>
      <ul>
        {items.map((item) => (
          <li key={item.submissionId}>
            <strong>{item.studentName}</strong>
            <p>{item.guildName}</p>
            <p>{item.dayLabel}</p>
            <p>{item.suggestedScore}</p>
            <p>{item.decision}</p>
            <p>{item.rationale}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
