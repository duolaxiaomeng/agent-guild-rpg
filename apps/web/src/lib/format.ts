export function toTimeLabel(timestamp: string) {
  try {
    return new Date(timestamp).toLocaleString("zh-CN", {
      timeZone: "Asia/Shanghai",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return timestamp.slice(0, 16).replace("T", " ");
  }
}

export function toDayLabel(dayId: string) {
  return `第 ${dayId.replace("day-", "")} 天`;
}

export type QuestStatus = "open" | "locked" | "completed";
export type DayStatus = "completed" | "current" | "locked";

export function toDayStatus(status: QuestStatus): DayStatus {
  if (status === "completed") {
    return "completed";
  }

  if (status === "open") {
    return "current";
  }

  return "locked";
}

export function toRewardText(status: QuestStatus): string {
  if (status === "completed") {
    return "已达成，可进入回顾";
  }

  if (status === "open") {
    return "等待学生完成当日任务";
  }

  return "等待上一关完成后解锁";
}
