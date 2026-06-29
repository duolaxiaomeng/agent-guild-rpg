const API_BASE_URL = "http://localhost:3001";

export type ApiPayloadState<T> = {
  data: T;
  degraded: boolean;
};

export type AuthUser = {
  id: string;
  role: "teacher" | "student";
  displayName: string;
};

export type AuthSession = {
  token: string;
  user: AuthUser;
};

export type LoginPayload = {
  email: string;
  password: string;
};

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

export type CreateSubmissionPayload = {
  studentId: string;
  courseWorldId: string;
  dayId: string;
  agentSessionId: string;
  triggerType: "button" | "chat_command" | "schedule";
  conversationSummary: string;
  workSummary: string;
  artifacts: Array<{
    kind: string;
    label: string;
    url: string;
  }>;
  selfReflection: string;
  agentEvaluationHints: string[];
  timestamp: string;
};

export type CreateSubmissionResponse = {
  submission: {
    id: string;
  };
};

export type DecideReviewPayload = {
  submissionId: string;
  finalScore: number;
  decision: "approve" | "adjust" | "reject";
};

export type DecideReviewResponse = DecideReviewPayload;

export type ChatOverviewPayload = {
  studentId: string;
  studentName: string;
  agentLabel: string;
  sessionStatus: "active" | "completed" | "failed";
  sessionSummary: string;
  latestSubmission: {
    id: string;
    statusLabel: string;
    submittedAt: string;
    dayLabel: string;
  } | null;
  collaborationGuests: Array<{
    studentId: string;
    studentName: string;
    contributionLabel: string;
  }>;
};

export type RoomAccessGrant = {
  id: string;
  roomId: string;
  granteeId: string;
  granteeName: string;
  scope: string;
  status: "approved" | "revoked";
  createdAt: string;
  expiresAt: string;
};

export type CreateRoomAccessGrantPayload = {
  roomId: string;
  granteeId: string;
  scope?: string;
  expiresInHours?: number;
};

const EMPTY_WORLD_PAYLOAD: WorldPayload = {
  currentDay: 0,
  location: "offline",
  homesteads: []
};

const EMPTY_GUILD_LIST: GuildSummary[] = [];

const EMPTY_QUEST_LIST: QuestSummary[] = [];
const EMPTY_ROOM_ACCESS_GRANTS: RoomAccessGrant[] = [];

const EMPTY_REVIEW_QUEUE: ReviewQueuePayload = {
  summary: {
    pendingCount: 0,
    reviewedToday: 0,
    flaggedCount: 0
  },
  items: []
};

const EMPTY_CHAT_OVERVIEW = (studentId: string): ChatOverviewPayload => ({
  studentId,
  studentName: "当前学生",
  agentLabel: "Agent 暂不可用",
  sessionStatus: "failed",
  sessionSummary: "实时教学 API 暂不可达，当前展示安全空态。",
  latestSubmission: null,
  collaborationGuests: []
});

async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch ${path}: ${response.status}`);
  }

  return response.json() as Promise<T>;
}

async function fetchJsonWithHeaders<T>(
  path: string,
  headers: HeadersInit
): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    cache: "no-store",
    headers
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch ${path}: ${response.status}`);
  }

  return response.json() as Promise<T>;
}

async function postJson<TResponse, TBody>(
  path: string,
  body: TBody
): Promise<TResponse> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    throw new Error(`Failed to post ${path}: ${response.status}`);
  }

  return response.json() as Promise<TResponse>;
}

async function fetchJsonSafe<T>(
  path: string,
  fallback: T
): Promise<ApiPayloadState<T>> {
  try {
    const data = await fetchJson<T>(path);

    return {
      data,
      degraded: false
    };
  } catch {
    return {
      data: fallback,
      degraded: true
    };
  }
}

export async function getWorldPayload() {
  return fetchJson<WorldPayload>("/world");
}

export async function login(payload: LoginPayload) {
  return postJson<AuthSession, LoginPayload>("/auth/login", payload);
}

export async function getCurrentSession(token: string) {
  return fetchJsonWithHeaders<AuthSession>("/auth/session", {
    Authorization: `Bearer ${token}`
  });
}

export async function getWorldPayloadSafe() {
  return fetchJsonSafe("/world", EMPTY_WORLD_PAYLOAD);
}

export async function getGuildList() {
  return fetchJson<GuildSummary[]>("/guilds");
}

export async function getGuildListSafe() {
  return fetchJsonSafe("/guilds", EMPTY_GUILD_LIST);
}

export async function getQuestList() {
  return fetchJson<QuestSummary[]>("/quests");
}

export async function getQuestListSafe() {
  return fetchJsonSafe("/quests", EMPTY_QUEST_LIST);
}

export async function getReviewQueue() {
  return fetchJson<ReviewQueuePayload>("/reviews");
}

export async function getReviewQueueSafe() {
  return fetchJsonSafe("/reviews", EMPTY_REVIEW_QUEUE);
}

export async function getChatOverview(studentId: string) {
  return fetchJson<ChatOverviewPayload>(`/chat?studentId=${studentId}`);
}

export async function getChatOverviewSafe(studentId: string) {
  return fetchJsonSafe(`/chat?studentId=${studentId}`, EMPTY_CHAT_OVERVIEW(studentId));
}

export async function getRoomAccessGrants(roomId: string) {
  return fetchJson<RoomAccessGrant[]>(`/rooms/access-grants?roomId=${roomId}`);
}

export async function getRoomAccessGrantsSafe(roomId: string) {
  return fetchJsonSafe(
    `/rooms/access-grants?roomId=${roomId}`,
    EMPTY_ROOM_ACCESS_GRANTS
  );
}

export async function createSubmission(payload: CreateSubmissionPayload) {
  return postJson<CreateSubmissionResponse, CreateSubmissionPayload>(
    "/submissions",
    payload
  );
}

export async function createRoomAccessGrant(payload: CreateRoomAccessGrantPayload) {
  return postJson<RoomAccessGrant, CreateRoomAccessGrantPayload>(
    "/rooms/access-grants",
    payload
  );
}

export async function revokeRoomAccessGrant(grantId: string) {
  return postJson<RoomAccessGrant, Record<string, never>>(
    `/rooms/access-grants/${grantId}/revoke`,
    {}
  );
}

export async function decideReview(payload: DecideReviewPayload) {
  return postJson<DecideReviewResponse, DecideReviewPayload>(
    "/reviews/decide",
    payload
  );
}
