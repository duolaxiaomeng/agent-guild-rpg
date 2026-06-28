type ReviewQueueSummary = {
  pendingCount: number;
  reviewedToday: number;
  flaggedCount: number;
};

type ReviewQueueItem = {
  submissionId: string;
  studentName: string;
  guildName: string;
  dayLabel: string;
  decisionLabel: string;
  finalScore: number;
  submittedAtLabel: string;
  rationale: string;
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
        <span>待老师裁定 {summary.pendingCount}</span>
        <span>今日已裁定 {summary.reviewedToday}</span>
        <span>需重点关注 {summary.flaggedCount}</span>
      </div>
      <ul>
        {items.map((item) => (
          <li key={item.submissionId}>
            <strong>{item.studentName}</strong>
            <p>{item.guildName}</p>
            <p>{item.dayLabel}</p>
            <p>{item.decisionLabel}</p>
            <p>终评分 {item.finalScore}</p>
            <p>{item.submittedAtLabel}</p>
            <p>{item.rationale}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
