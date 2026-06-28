const API_BASE_URL = "http://localhost:3001";

export type WorldPayload = {
  currentDay: number;
  location: string;
  homesteads: Array<{
    ownerId: string;
    displayName: string;
    location: string;
    isOnline: boolean;
  }>;
};

export type GuildSummary = {
  id: string;
  name: string;
  memberCount: number;
  collaborationPoints: number;
};

export type QuestSummary = {
  id: string;
  title: string;
  status: "open" | "locked" | "completed";
};

export type ReviewQueueSummary = {
  pendingCount: number;
  reviewedToday: number;
  flaggedCount: number;
};

export type ReviewQueueItem = {
  submissionId: string;
  studentName: string;
  guildName: string;
  suggestedScore: number;
  finalScore: number;
  decision: "approve" | "adjust" | "reject";
  rationale: string;
  dayLabel: string;
  submittedAt: string;
};

export type ReviewQueuePayload = {
  summary: ReviewQueueSummary;
  items: ReviewQueueItem[];
};

async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    cache: "no-store"
  });

  return response.json() as Promise<T>;
}

export async function getWorldPayload() {
  return fetchJson<WorldPayload>("/world");
}

export async function getGuildList() {
  return fetchJson<GuildSummary[]>("/guilds");
}

export async function getQuestList() {
  return fetchJson<QuestSummary[]>("/quests");
}

export async function getReviewQueue() {
  return fetchJson<ReviewQueuePayload>("/reviews");
}
