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
    <section className="day-panel" aria-labelledby="day-panel-heading">
      <h2 className="day-panel__heading" id="day-panel-heading">
        每日关卡
      </h2>

      {days.length > 0 ? (
        <ol className="day-panel__grid">
          {days.map((day) => {
            const isCurrent = day.id === currentDayId;

            return (
              <li
                className="day-card"
                data-status={day.status}
                key={day.id}
                aria-current={isCurrent ? "step" : undefined}
              >
                <div className="day-card__topline">
                  <strong className="day-card__label">{day.label}</strong>
                  <span className="day-card__status">
                    {getStatusLabel(day.status)}
                  </span>
                </div>
                <p className="day-card__title">{day.title}</p>
                <p className="day-card__reward">
                  <span className="day-card__reward-label">奖励</span>
                  <span>{day.reward}</span>
                </p>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="day-panel__empty">暂时没有可展示的关卡。</p>
      )}
    </section>
  );
}
