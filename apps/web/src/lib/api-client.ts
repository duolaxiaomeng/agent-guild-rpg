const PUBLIC_API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3001";
const API_BASE_URL = typeof window === "undefined"
  ? process.env.API_INTERNAL_BASE_URL ?? PUBLIC_API_BASE_URL
  : PUBLIC_API_BASE_URL;
const API_TIMEOUT_MS = 5000; // 5 seconds

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

export type RegisterPayload = LoginPayload & {
  displayName: string;
  registrationCode: string;
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
  courseWorldId?: string;
  dayId?: string;
  title: string;
  status: "open" | "locked" | "completed";
  description?: string;
  homework?: string;
  acceptanceCriteria?: string[];
  dueAt?: string | null;
  publishedAt?: string | null;
  teacherId?: string | null;
};

export type WebsiteLotteryOption = {
  id: string;
  dayId: string;
  label: string;
  description: string;
  isActive: boolean;
  sortOrder: number;
};

export type WebsiteLotteryDraw = {
  id: string;
  dayId: string;
  studentId: string;
  drawnAt: string;
  option: WebsiteLotteryOption;
};

export type WebsiteLotteryPayload = {
  dayId: string;
  options: WebsiteLotteryOption[];
  draw: WebsiteLotteryDraw | null;
};

export type WebsiteLotteryOptionInput = {
  label: string;
  description?: string;
  isActive?: boolean;
  sortOrder?: number;
};

export type ReviewQueueSummary = {
  pendingCount: number;
  queuedCount?: number;
  pendingTeacherDecisionCount?: number;
  reviewedToday: number;
  flaggedCount: number;
};

export type ReviewQueueItem = {
  submissionId: string;
  studentName: string;
  guildName: string;
  reviewStatus: "queued" | "ai_reviewed" | "teacher_decided";
  suggestedScore: number | null;
  finalScore: number | null;
  decision: "approve" | "adjust" | "reject" | null;
  isPendingTeacherDecision: boolean;
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

export type ChatMessage = {
  id: string;
  roomId: string;
  authorId: string;
  authorName: string;
  body: string;
  createdAt: string;
};

export type ChatRoomPayload = ChatOverviewPayload & {
  roomId: string;
  viewerRole: "owner" | "guest" | "teacher";
  messages: ChatMessage[];
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

export type AccessibleRoom = {
  roomId: string;
  ownerId: string;
  ownerName: string;
  scope: string;
  expiresAt: string;
  createdAt: string;
};

export type CreateRoomAccessGrantPayload = {
  roomId: string;
  granteeId: string;
  scope?: string;
  expiresInHours?: number;
};

export type CreateChatMessagePayload = {
  roomId: string;
  body: string;
};

export type AgentAvatar = {
  studentId: string;
  displayName: string;
  status: "online" | "working" | "reviewing" | "idle" | "offline";
  currentZone: "lobby" | "workstations" | "collab-room" | "review-station";
  lastActiveAt: string;
  activitySummary: string;
};

export type AgentConnectorProfile = {
  connectorId: string;
  agentSessionId: string;
  provider: string;
  clientName: string;
  status: "online" | "offline" | "revoked";
  capabilities: string[];
  connectedAt: string;
  lastSeenAt: string;
};

export type AgentPairingResponse = {
  connectionCredential: string;
  expiresAt: string;
};

export type AgentEvent = {
  id: string;
  connectorId: string;
  studentId: string;
  dayId: string;
  type: string;
  payload: Record<string, unknown>;
  occurredAt: string;
  createdAt: string;
};

export type AgentTeamRole = {
  roleKey: string;
  name: string;
  description: string;
  capabilities: string[];
  defaultModel: string;
  adapter: string;
  parallelResponsibilities: string[];
};

export type AgentTeamCatalog = {
  roles: AgentTeamRole[];
};

const EMPTY_AGENT_AVATARS: AgentAvatar[] = [];

const EMPTY_WORLD_PAYLOAD: WorldPayload = {
  currentDay: 0,
  location: "offline",
  homesteads: []
};

const EMPTY_GUILD_LIST: GuildSummary[] = [];

const EMPTY_QUEST_LIST: QuestSummary[] = [];
const EMPTY_WEBSITE_LOTTERY = (dayId: string): WebsiteLotteryPayload => ({
  dayId,
  options: [],
  draw: null
});
const EMPTY_ROOM_ACCESS_GRANTS: RoomAccessGrant[] = [];
const EMPTY_ACCESSIBLE_ROOMS: AccessibleRoom[] = [];

const EMPTY_REVIEW_QUEUE: ReviewQueuePayload = {
  summary: {
    pendingCount: 0,
    queuedCount: 0,
    pendingTeacherDecisionCount: 0,
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

const EMPTY_CHAT_ROOM = (roomId: string): ChatRoomPayload => ({
  roomId,
  viewerRole: "owner",
  ...EMPTY_CHAT_OVERVIEW("student-self"),
  messages: []
});

import type {
  ClassroomSnapshot,
  HelpRequest,
  CreateHelpRequestInput,
  CreateTeacherTaskInput,
  TeacherTask,
  TeacherTaskProgressPayload
} from "contracts";

export type {
  CreateTeacherTaskInput,
  TeacherTask,
  TeacherTaskProgressPayload
} from "contracts";

export type ClassroomSnapshotPayload = ClassroomSnapshot;

const EMPTY_CLASSROOM_SNAPSHOT: ClassroomSnapshot = {
  session: {
    id: "",
    courseWorldId: "",
    dayId: "",
    status: "draft",
    version: 0,
    currentStageId: null,
    startedAt: null,
    endedAt: null
  },
  currentStage: null,
  stages: [],
  helpRequests: [],
  viewer: { role: "student", canControlStages: false, canHandleHelp: false },
  serverNow: new Date(0).toISOString()
};

const EMPTY_TEACHER_TASK_PROGRESS: TeacherTaskProgressPayload[] = [];

async function fetchJson<T>(path: string): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

  try {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      cache: "no-store",
      credentials: "include",
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch ${path}: ${response.status}`);
    }

    return response.json() as Promise<T>;
  } finally {
    clearTimeout(timeoutId);
  }
}

function toAuthHeaders(token?: string) {
  if (!token) {
    return undefined;
  }

  return {
    Authorization: `Bearer ${token}`
  } satisfies HeadersInit;
}

async function fetchJsonWithHeaders<T>(
  path: string,
  headers: HeadersInit
): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

  try {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      cache: "no-store",
      headers,
      credentials: "include",
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch ${path}: ${response.status}`);
    }

    return response.json() as Promise<T>;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function postJson<TResponse, TBody>(
  path: string,
  body: TBody,
  headers?: HeadersInit
): Promise<TResponse> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

  try {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...headers
      },
      body: JSON.stringify(body),
      credentials: "include",
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`Failed to post ${path}: ${response.status}`);
    }

    return response.json() as Promise<TResponse>;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function writeJson<TResponse>(
  path: string,
  method: "PATCH" | "DELETE",
  token: string,
  body?: unknown
) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
  try {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      cache: "no-store",
      credentials: "include",
      signal: controller.signal
    });
    if (!response.ok) {
      throw new Error(`Failed to ${method} ${path}: ${response.status}`);
    }
    return response.json() as Promise<TResponse>;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function fetchJsonSafe<T>(
  path: string,
  fallback: T,
  token?: string
): Promise<ApiPayloadState<T>> {
  try {
    const data = token
      ? await fetchJsonWithHeaders<T>(path, toAuthHeaders(token) ?? {})
      : await fetchJson<T>(path);

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
  if (typeof window !== "undefined") {
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      credentials: "include"
    });
    if (!response.ok) {
      throw new Error(`Failed to post /auth/login: ${response.status}`);
    }
    return response.json() as Promise<AuthSession>;
  }
  return postJson<AuthSession, LoginPayload>("/auth/login", payload);
}

export async function register(payload: RegisterPayload) {
  if (typeof window !== "undefined") {
    const response = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      credentials: "include"
    });
    if (!response.ok) {
      throw new Error(`Failed to post /auth/register: ${response.status}`);
    }
    return response.json() as Promise<AuthSession>;
  }
  return postJson<AuthSession, RegisterPayload>("/auth/register", payload);
}

export async function getCurrentSession(token?: string) {
  // In production the browser keeps the credential in an HttpOnly cookie;
  // omit an empty bearer header so the API can authenticate from that cookie.
  return token
    ? fetchJsonWithHeaders<AuthSession>("/auth/session", {
        Authorization: `Bearer ${token}`
      })
    : fetchJson<AuthSession>("/auth/session");
}

export async function createAgentPairing(token: string) {
  return postJson<AgentPairingResponse, Record<string, never>>(
    "/agent-connectors/pairing",
    {},
    toAuthHeaders(token)
  );
}

export async function getAgentConnectorProfile(token: string) {
  return fetchJsonWithHeaders<AgentConnectorProfile | null>(
    "/agent-connectors/me",
    toAuthHeaders(token) ?? {}
  );
}

export async function getAgentConnectorProfileSafe(token: string) {
  return fetchJsonSafe<AgentConnectorProfile | null>(
    "/agent-connectors/me",
    null,
    token
  );
}

export async function getAgentEvents(dayId: string, token: string) {
  return fetchJsonWithHeaders<AgentEvent[]>(
    `/agent-connectors/events?dayId=${encodeURIComponent(dayId)}`,
    toAuthHeaders(token) ?? {}
  );
}

export async function getAgentEventsSafe(dayId: string, token: string) {
  return fetchJsonSafe<AgentEvent[]>(
    `/agent-connectors/events?dayId=${encodeURIComponent(dayId)}`,
    [],
    token
  );
}

export async function getAgentTeamCatalog(token: string) {
  return fetchJsonWithHeaders<AgentTeamCatalog>(
    "/agent-team/catalog",
    toAuthHeaders(token) ?? {}
  );
}

export async function getAgentTeamCatalogSafe(token: string) {
  return fetchJsonSafe<AgentTeamCatalog>(
    "/agent-team/catalog",
    { roles: [] },
    token
  );
}

export async function getWorldPayloadSafe(token?: string) {
  return fetchJsonSafe("/world", EMPTY_WORLD_PAYLOAD, token);
}

export async function getGuildList() {
  return fetchJson<GuildSummary[]>("/guilds");
}

export async function getGuildListSafe(token?: string) {
  return fetchJsonSafe("/guilds", EMPTY_GUILD_LIST, token);
}

export async function getQuestList(token?: string) {
  return token
    ? fetchJsonWithHeaders<QuestSummary[]>("/quests", toAuthHeaders(token) ?? {})
    : fetchJson<QuestSummary[]>("/quests");
}

export async function getQuestListSafe(token?: string) {
  return fetchJsonSafe("/quests", EMPTY_QUEST_LIST, token);
}

export async function getTeacherTaskProgress(token?: string) {
  return token
    ? fetchJsonWithHeaders<TeacherTaskProgressPayload[]>(
        "/quests/progress",
        toAuthHeaders(token) ?? {}
      )
    : fetchJson<TeacherTaskProgressPayload[]>("/quests/progress");
}

export async function getTeacherTaskProgressSafe(token?: string) {
  return fetchJsonSafe(
    "/quests/progress",
    EMPTY_TEACHER_TASK_PROGRESS,
    token
  );
}

export async function createTeacherTask(
  payload: CreateTeacherTaskInput,
  token?: string
) {
  return postJson<TeacherTask, CreateTeacherTaskInput>(
    "/quests",
    payload,
    toAuthHeaders(token)
  );
}

export async function getWebsiteLottery(dayId: string, token: string) {
  return fetchJsonWithHeaders<WebsiteLotteryPayload>(
    `/website-lottery/days/${encodeURIComponent(dayId)}`,
    toAuthHeaders(token) ?? {}
  );
}

export async function getWebsiteLotterySafe(dayId: string, token?: string) {
  if (!token) return { data: EMPTY_WEBSITE_LOTTERY(dayId), degraded: true };
  return fetchJsonSafe(
    `/website-lottery/days/${encodeURIComponent(dayId)}`,
    EMPTY_WEBSITE_LOTTERY(dayId),
    token
  );
}

export async function drawWebsiteLottery(dayId: string, token: string) {
  return postJson<{ alreadyDrawn: boolean; draw: WebsiteLotteryDraw }, Record<string, never>>(
    `/website-lottery/days/${encodeURIComponent(dayId)}/draw`,
    {},
    toAuthHeaders(token)
  );
}

export async function createWebsiteLotteryOption(
  dayId: string,
  payload: WebsiteLotteryOptionInput,
  token: string
) {
  return postJson<WebsiteLotteryOption, WebsiteLotteryOptionInput>(
    `/website-lottery/days/${encodeURIComponent(dayId)}/options`,
    payload,
    toAuthHeaders(token)
  );
}

export async function updateWebsiteLotteryOption(
  dayId: string,
  optionId: string,
  payload: WebsiteLotteryOptionInput,
  token: string
) {
  return writeJson<WebsiteLotteryOption>(
    `/website-lottery/days/${encodeURIComponent(dayId)}/options/${encodeURIComponent(optionId)}`,
    "PATCH",
    token,
    payload
  );
}

export async function deleteWebsiteLotteryOption(dayId: string, optionId: string, token: string) {
  return writeJson<{ id: string; deleted: boolean }>(
    `/website-lottery/days/${encodeURIComponent(dayId)}/options/${encodeURIComponent(optionId)}`,
    "DELETE",
    token
  );
}

export async function getReviewQueue(token?: string) {
  return token
    ? fetchJsonWithHeaders<ReviewQueuePayload>("/reviews", toAuthHeaders(token) ?? {})
    : fetchJson<ReviewQueuePayload>("/reviews");
}

export async function getReviewQueueSafe(token?: string) {
  return fetchJsonSafe("/reviews", EMPTY_REVIEW_QUEUE, token);
}

export async function getChatOverview(studentId?: string, token?: string) {
  const query = studentId ? `?studentId=${studentId}` : "";

  return token
    ? fetchJsonWithHeaders<ChatOverviewPayload>(`/chat${query}`, toAuthHeaders(token) ?? {})
    : fetchJson<ChatOverviewPayload>(`/chat${query}`);
}

export async function getChatOverviewSafe(studentId?: string, token?: string) {
  const query = studentId ? `?studentId=${studentId}` : "";

  return fetchJsonSafe(`/chat${query}`, EMPTY_CHAT_OVERVIEW(studentId ?? "student-self"), token);
}

export async function getChatRoom(roomId: string, token?: string) {
  const path = `/chat?roomId=${roomId}`;

  return token
    ? fetchJsonWithHeaders<ChatRoomPayload>(path, toAuthHeaders(token) ?? {})
    : fetchJson<ChatRoomPayload>(path);
}

export async function getChatRoomSafe(roomId: string, token?: string) {
  return fetchJsonSafe(`/chat?roomId=${roomId}`, EMPTY_CHAT_ROOM(roomId), token);
}

export async function getRoomAccessGrants(roomId: string, token?: string) {
  return token
    ? fetchJsonWithHeaders<RoomAccessGrant[]>(
        `/rooms/access-grants?roomId=${roomId}`,
        toAuthHeaders(token) ?? {}
      )
    : fetchJson<RoomAccessGrant[]>(`/rooms/access-grants?roomId=${roomId}`);
}

export async function getRoomAccessGrantsSafe(roomId: string, token?: string) {
  return fetchJsonSafe(
    `/rooms/access-grants?roomId=${roomId}`,
    EMPTY_ROOM_ACCESS_GRANTS,
    token
  );
}

export async function getMyAccessibleRooms(token?: string) {
  return token
    ? fetchJsonWithHeaders<AccessibleRoom[]>("/rooms/accessible-rooms", toAuthHeaders(token) ?? {})
    : fetchJson<AccessibleRoom[]>("/rooms/accessible-rooms");
}

export async function getMyAccessibleRoomsSafe(token?: string) {
  return fetchJsonSafe("/rooms/accessible-rooms", EMPTY_ACCESSIBLE_ROOMS, token);
}

export async function createSubmission(
  payload: CreateSubmissionPayload,
  token?: string
) {
  return postJson<CreateSubmissionResponse, CreateSubmissionPayload>(
    "/submissions",
    payload,
    toAuthHeaders(token)
  );
}

export async function createChatMessage(
  payload: CreateChatMessagePayload,
  token?: string
) {
  return postJson<ChatMessage, CreateChatMessagePayload>(
    "/chat/messages",
    payload,
    toAuthHeaders(token)
  );
}

export async function createRoomAccessGrant(
  payload: CreateRoomAccessGrantPayload,
  token?: string
) {
  return postJson<RoomAccessGrant, CreateRoomAccessGrantPayload>(
    "/rooms/access-grants",
    payload,
    toAuthHeaders(token)
  );
}

export async function revokeRoomAccessGrant(grantId: string, token?: string) {
  return postJson<RoomAccessGrant, Record<string, never>>(
    `/rooms/access-grants/${grantId}/revoke`,
    {},
    toAuthHeaders(token)
  );
}

export async function decideReview(payload: DecideReviewPayload, token?: string) {
  return postJson<DecideReviewResponse, DecideReviewPayload>(
    "/reviews/decide",
    payload,
    toAuthHeaders(token)
  );
}

/* ------------------------------------------------------------------ */
/*  Classroom control center                                           */
/* ------------------------------------------------------------------ */

export async function getClassroomSnapshot(sessionId: string, token: string) {
  return fetchJsonWithHeaders<ClassroomSnapshot>(
    `/classrooms/sessions/${encodeURIComponent(sessionId)}`,
    toAuthHeaders(token) ?? {}
  );
}

export async function getActiveClassroom(token: string) {
  return fetchJsonWithHeaders<ClassroomSnapshot>(
    "/classrooms/sessions/active",
    toAuthHeaders(token) ?? {}
  );
}

export async function getActiveClassroomSafe(token: string): Promise<ApiPayloadState<ClassroomSnapshot>> {
  try {
    const data = await getActiveClassroom(token);
    return data ? { data, degraded: false } : { data: EMPTY_CLASSROOM_SNAPSHOT, degraded: true };
  } catch {
    return { data: EMPTY_CLASSROOM_SNAPSHOT, degraded: true };
  }
}

export async function getHelpRequests(sessionId: string, token: string) {
  return fetchJsonWithHeaders<HelpRequest[]>(
    `/classrooms/sessions/${encodeURIComponent(sessionId)}/help-requests`,
    toAuthHeaders(token) ?? {}
  );
}

export async function getHelpRequestsSafe(sessionId: string, token: string) {
  return fetchJsonSafe<HelpRequest[]>(
    `/classrooms/sessions/${encodeURIComponent(sessionId)}/help-requests`,
    [],
    token
  );
}

type StageControlResponse = ClassroomSnapshot;

function stageControl(
  stageId: string,
  action: "start" | "pause" | "complete" | "unlock-next",
  expectedVersion: number,
  token: string
) {
  return postJson<StageControlResponse, { expectedVersion: number }>(
    `/classrooms/stages/${encodeURIComponent(stageId)}/${action}`,
    { expectedVersion },
    toAuthHeaders(token)
  );
}

export function startClassroomStage(stageId: string, expectedVersion: number, token: string) {
  return stageControl(stageId, "start", expectedVersion, token);
}

export function pauseClassroomStage(stageId: string, expectedVersion: number, token: string) {
  return stageControl(stageId, "pause", expectedVersion, token);
}

export function completeClassroomStage(stageId: string, expectedVersion: number, token: string) {
  return stageControl(stageId, "complete", expectedVersion, token);
}

export function endClassroomStage(stageId: string, expectedVersion: number, token: string) {
  return postJson<StageControlResponse, { expectedVersion: number }>(
    `/classrooms/stages/${encodeURIComponent(stageId)}/end-early`,
    { expectedVersion },
    toAuthHeaders(token)
  );
}

export function unlockNextClassroomStage(stageId: string, expectedVersion: number, token: string) {
  return stageControl(stageId, "unlock-next", expectedVersion, token);
}

export function extendClassroomStage(stageId: string, seconds: number, expectedVersion: number, token: string) {
  return postJson<StageControlResponse, { seconds: number; expectedVersion: number }>(
    `/classrooms/stages/${encodeURIComponent(stageId)}/extend`,
    { seconds, expectedVersion },
    toAuthHeaders(token)
  );
}

export function createHelpRequest(input: CreateHelpRequestInput, token: string) {
  return postJson<HelpRequest, CreateHelpRequestInput>(
    "/classrooms/help-requests",
    input,
    toAuthHeaders(token)
  );
}

export function claimHelpRequest(helpRequestId: string, token: string): Promise<HelpRequest>;
export function claimHelpRequest(helpRequestId: string, expectedVersion: number, token: string): Promise<HelpRequest>;
export function claimHelpRequest(
  helpRequestId: string,
  expectedVersionOrToken: number | string,
  maybeToken?: string
) {
  const expectedVersion = typeof expectedVersionOrToken === "number" ? expectedVersionOrToken : 0;
  const token = typeof expectedVersionOrToken === "string" ? expectedVersionOrToken : maybeToken ?? "";
  return postJson<HelpRequest, { expectedVersion: number }>(
    `/classrooms/help-requests/${encodeURIComponent(helpRequestId)}/claim`,
    { expectedVersion },
    toAuthHeaders(token)
  );
}

export function resolveHelpRequest(helpRequestId: string, resolutionNote: string, token: string, expectedVersion?: number) {
  return postJson<HelpRequest, { resolutionNote: string; expectedVersion: number }>(
    `/classrooms/help-requests/${encodeURIComponent(helpRequestId)}/resolve`,
    { resolutionNote, expectedVersion: expectedVersion ?? 0 },
    toAuthHeaders(token)
  );
}

export async function fetchAgentAvatars(zone?: string): Promise<AgentAvatar[]> {
  const query = zone ? `?zone=${zone}` : "";
  return fetchJson<AgentAvatar[]>(`/agent-avatars${query}`);
}

export async function fetchAgentAvatarsWithToken(token: string): Promise<AgentAvatar[]> {
  return fetchJsonWithHeaders<AgentAvatar[]>("/agent-avatars", toAuthHeaders(token) ?? {});
}

export async function fetchAgentAvatarsSafe(
  zone?: string,
  token?: string
): Promise<{ avatars: AgentAvatar[]; degraded: boolean }> {
  const query = zone ? `?zone=${zone}` : "";
  const result = await fetchJsonSafe(`/agent-avatars${query}`, EMPTY_AGENT_AVATARS, token);
  return {
    avatars: result.data,
    degraded: result.degraded
  };
}

export async function fetchAgentAvatarsSafeWithToken(
  token: string,
): Promise<{ avatars: AgentAvatar[]; degraded: boolean }> {
  try {
    const avatars = await fetchAgentAvatarsWithToken(token);
    return { avatars, degraded: false };
  } catch {
    return { avatars: EMPTY_AGENT_AVATARS, degraded: true };
  }
}

/* ------------------------------------------------------------------ */
/*  NPC Conversation                                                   */
/* ------------------------------------------------------------------ */

export type NpcConversationResponse = {
  npcId: string;
  npcName: string;
  reply: string;
  degraded: boolean;
  llmUsed?: boolean;
};

/**
 * Fetch an NPC conversation reply from the backend.
 *
 * If the backend is unreachable or ARK_API_KEY is not configured,
 * a static fallback reply is returned so the UI never breaks.
 */
export async function fetchNpcConversation(
  npcId: string,
  studentId?: string,
  message?: string,
): Promise<NpcConversationResponse> {
  const params = new URLSearchParams();
  if (studentId) params.set("studentId", studentId);
  if (message) params.set("message", message);
  const query = params.toString() ? `?${params.toString()}` : "";

  return fetchJson<NpcConversationResponse>(
    `/npc/${encodeURIComponent(npcId)}/conversation${query}`,
  );
}

/**
 * Safe variant that never throws — returns a fallback when the API
 * is unreachable so the caller can display a static tooltip.
 */
export async function fetchNpcConversationSafe(
  npcId: string,
  studentId?: string,
  message?: string,
): Promise<ApiPayloadState<NpcConversationResponse>> {
  const params = new URLSearchParams();
  if (studentId) params.set("studentId", studentId);
  if (message) params.set("message", message);
  const query = params.toString() ? `?${params.toString()}` : "";
  const path = `/npc/${encodeURIComponent(npcId)}/conversation${query}`;

  return fetchJsonSafe(path, {
    npcId,
    npcName: "",
    reply: "",
    degraded: true,
  });
}

/* ------------------------------------------------------------------ */
/*  Learning Insights                                                  */
/* ------------------------------------------------------------------ */

export type StudentInsight = {
  strengths: string[];
  weaknesses: string[];
  recommendations: string[];
  nextQuestSuggestion: string;
};

export type ClassInsight = {
  commonIssues: string[];
  topPerformers: string[];
  needsAttention: string[];
  classProgress: string;
};

const EMPTY_STUDENT_INSIGHT: StudentInsight = {
  strengths: [],
  weaknesses: [],
  recommendations: [],
  nextQuestSuggestion: "",
};

const EMPTY_CLASS_INSIGHT: ClassInsight = {
  commonIssues: [],
  topPerformers: [],
  needsAttention: [],
  classProgress: "",
};

export async function getStudentInsights(
  studentId: string,
  token?: string,
): Promise<StudentInsight> {
  return token
    ? fetchJsonWithHeaders<StudentInsight>(
        `/learning-insights/student/${encodeURIComponent(studentId)}`,
        toAuthHeaders(token) ?? {},
      )
    : fetchJson<StudentInsight>(
        `/learning-insights/student/${encodeURIComponent(studentId)}`,
      );
}

export async function getStudentInsightsSafe(
  studentId: string,
  token?: string,
): Promise<ApiPayloadState<StudentInsight>> {
  return fetchJsonSafe(
    `/learning-insights/student/${encodeURIComponent(studentId)}`,
    EMPTY_STUDENT_INSIGHT,
    token,
  );
}

export async function getClassInsights(
  teacherId: string,
  token?: string,
): Promise<ClassInsight> {
  const query = teacherId ? `?teacherId=${encodeURIComponent(teacherId)}` : "";
  return token
    ? fetchJsonWithHeaders<ClassInsight>(
        `/learning-insights/class${query}`,
        toAuthHeaders(token) ?? {},
      )
    : fetchJson<ClassInsight>(`/learning-insights/class${query}`);
}

export async function getClassInsightsSafe(
  teacherId: string,
  token?: string,
): Promise<ApiPayloadState<ClassInsight>> {
  const query = teacherId ? `?teacherId=${encodeURIComponent(teacherId)}` : "";
  return fetchJsonSafe(
    `/learning-insights/class${query}`,
    EMPTY_CLASS_INSIGHT,
    token,
  );
}

/* ------------------------------------------------------------------ */
/*  Teaching Agents — SOP                                              */
/* ------------------------------------------------------------------ */

export type SopType = "submission-review" | "student-question" | "quest-completion";

export type SopStep = {
  agentRole: string;
  agentName: string;
  output: string;
  timestamp: string;
};

export type SopResult = {
  sopType: SopType;
  steps: SopStep[];
  finalOutput: string;
  completedAt: string;
  degraded: boolean;
};

export type SopTypeInfo = {
  type: SopType;
  label: string;
  description: string;
  steps: string[];
};

export type CollaborationMessage = {
  agentRole: string;
  agentName: string;
  message: string;
  timestamp: string;
};

export type CollaborationResult = {
  topic: string;
  messages: CollaborationMessage[];
  summary: string;
  degraded: boolean;
};

/** Generate a fresh fallback SOP result each time (avoids stale timestamp). */
function createEmptySopResult(): SopResult {
  return {
    sopType: "submission-review",
    steps: [],
    finalOutput: "",
    completedAt: new Date().toISOString(),
    degraded: true,
  };
}

const EMPTY_SOP_TYPES: SopTypeInfo[] = [];

const EMPTY_COLLABORATION: CollaborationResult = {
  topic: "",
  messages: [],
  summary: "",
  degraded: true,
};

/** GET /teaching-agents/sop-types — list available SOP types */
export async function getSopTypes(token?: string): Promise<SopTypeInfo[]> {
  return token
    ? fetchJsonWithHeaders<SopTypeInfo[]>("/teaching-agents/sop-types", toAuthHeaders(token) ?? {})
    : fetchJson<SopTypeInfo[]>("/teaching-agents/sop-types");
}

export async function getSopTypesSafe(token?: string): Promise<ApiPayloadState<SopTypeInfo[]>> {
  return fetchJsonSafe("/teaching-agents/sop-types", EMPTY_SOP_TYPES, token);
}

/** POST /teaching-agents/review — trigger submission review SOP */
export async function runSubmissionReview(
  submissionId: string,
  token?: string,
): Promise<SopResult> {
  return postJson<SopResult, { submissionId: string }>(
    "/teaching-agents/review",
    { submissionId },
    toAuthHeaders(token),
  );
}

export async function runSubmissionReviewSafe(
  submissionId: string,
  token?: string,
): Promise<ApiPayloadState<SopResult>> {
  try {
    const data = await runSubmissionReview(submissionId, token);
    return { data, degraded: false };
  } catch {
    return { data: createEmptySopResult(), degraded: true };
  }
}

/** POST /teaching-agents/question — trigger student question SOP */
export async function runStudentQuestion(
  studentId: string,
  question: string,
  token?: string,
): Promise<SopResult> {
  return postJson<SopResult, { studentId: string; question: string }>(
    "/teaching-agents/question",
    { studentId, question },
    toAuthHeaders(token),
  );
}

export async function runStudentQuestionSafe(
  studentId: string,
  question: string,
  token?: string,
): Promise<ApiPayloadState<SopResult>> {
  try {
    const data = await runStudentQuestion(studentId, question, token);
    return { data, degraded: false };
  } catch {
    return { data: createEmptySopResult(), degraded: true };
  }
}

/** POST /teaching-agents/quest-complete — trigger quest completion SOP */
export async function runQuestCompletion(
  studentId: string,
  questId: string,
  token?: string,
): Promise<SopResult> {
  return postJson<SopResult, { studentId: string; questId: string }>(
    "/teaching-agents/quest-complete",
    { studentId, questId },
    toAuthHeaders(token),
  );
}

export async function runQuestCompletionSafe(
  studentId: string,
  questId: string,
  token?: string,
): Promise<ApiPayloadState<SopResult>> {
  try {
    const data = await runQuestCompletion(studentId, questId, token);
    return { data, degraded: false };
  } catch {
    return { data: createEmptySopResult(), degraded: true };
  }
}

/** POST /teaching-agents/collaborate — multi-agent collaboration */
export async function runCollaboration(
  agents: string[],
  topic: string,
  context?: string,
  token?: string,
): Promise<CollaborationResult> {
  return postJson<CollaborationResult, { agents: string[]; topic: string; context?: string }>(
    "/teaching-agents/collaborate",
    { agents, topic, context },
    toAuthHeaders(token),
  );
}

export async function runCollaborationSafe(
  agents: string[],
  topic: string,
  context?: string,
  token?: string,
): Promise<ApiPayloadState<CollaborationResult>> {
  try {
    const data = await runCollaboration(agents, topic, context, token);
    return { data, degraded: false };
  } catch {
    return { data: EMPTY_COLLABORATION, degraded: true };
  }
}
