import { randomUUID } from "node:crypto";
import type { AgentRole, AgentVisualRole } from "contracts";

export type ConnectorProfile = {
  connectorId: string;
  agentSessionId: string;
  provider: string;
  clientName: string;
  status: "online" | "offline" | "revoked";
  capabilities: string[];
  roleKey: AgentRole | null;
  visualRole: AgentVisualRole | null;
  connectedAt: string;
  lastSeenAt: string;
};

export type AgentEventInput = {
  eventId?: string;
  dayId: string;
  type: string;
  payload: Record<string, unknown>;
  occurredAt?: string;
};

export type NormalizedAgentEventInput = AgentEventInput & {
  eventId: string;
  occurredAt: string;
};

export type AgentEvent = NormalizedAgentEventInput & {
  id: string;
  connectorId: string;
  studentId: string;
  createdAt: string;
};

export type AgentEventCursorQuery = {
  cursor?: string;
  limit?: number;
};

export type AgentEventCursorPage = {
  events: AgentEvent[];
  nextCursor: string | null;
};

export type AgentTaskResourceClass = "light" | "heavy";
export type AgentTaskStatus =
  | "blocked"
  | "queued"
  | "leased"
  | "running"
  | "completed"
  | "failed"
  | "needs_teacher"
  | "cancelled";
export type AgentTaskFailureKind = "infrastructure" | "business";

export type AgentConnectorTask = {
  id: string;
  runId: string;
  scope: {
    courseWorldId: string | null;
    dayId: string | null;
    guildId: string | null;
    studentId: string;
  };
  provider: string;
  requiredCapabilities: string[];
  priority: number;
  resourceClass: AgentTaskResourceClass;
  status: AgentTaskStatus;
  payload: Record<string, unknown>;
  attemptCount: number;
  maxAttempts: number;
  createdAt: string;
};

export type AgentTaskClaimRequest = {
  lightCapacity?: number;
  heavyCapacity?: number;
  waitSeconds?: number;
};

export type AgentTaskLease = {
  task: AgentConnectorTask;
  leaseToken: string;
  leaseExpiresAt: string;
  heartbeatIntervalSeconds: number;
};

export type AgentTaskHeartbeatResponse = {
  taskId: string;
  status: AgentTaskStatus;
  leaseExpiresAt: string;
};

type ConnectResponse = ConnectorProfile & {
  connectorToken: string;
};

export type AgentConnectorClientOptions = {
  connectionCredential: string;
  provider: string;
  clientName: string;
  capabilities: string[];
  roleKey?: AgentRole;
  requestTimeoutMs?: number;
  heartbeatMaxRetries?: number;
  retryDelayMs?: number;
};

const DEFAULT_REQUEST_TIMEOUT_MS = 10_000;
const DEFAULT_HEARTBEAT_MAX_RETRIES = 2;
const MAX_HEARTBEAT_RETRIES = 5;
const DEFAULT_RETRY_DELAY_MS = 250;
const RETRYABLE_STATUS_CODES = new Set([408, 425, 429, 500, 502, 503, 504]);

export class AgentConnectorClient {
  private readonly options: AgentConnectorClientOptions;
  private readonly apiBaseUrl: string;
  private readonly requestTimeoutMs: number;
  private readonly heartbeatMaxRetries: number;
  private readonly retryDelayMs: number;
  private token?: string;

  constructor(options: AgentConnectorClientOptions) {
    this.options = options;
    this.apiBaseUrl = parseConnectionCredential(options.connectionCredential).serverUrl;
    this.requestTimeoutMs = positiveInteger(
      options.requestTimeoutMs,
      DEFAULT_REQUEST_TIMEOUT_MS
    );
    this.heartbeatMaxRetries = boundedNonNegativeInteger(
      options.heartbeatMaxRetries,
      DEFAULT_HEARTBEAT_MAX_RETRIES,
      MAX_HEARTBEAT_RETRIES
    );
    this.retryDelayMs = nonNegativeInteger(
      options.retryDelayMs,
      DEFAULT_RETRY_DELAY_MS
    );
  }

  get connectorToken() {
    return this.token;
  }

  async connect(): Promise<ConnectorProfile> {
    const response = await this.post<ConnectResponse>("/agent-connectors/connect", {
      connectionCredential: this.options.connectionCredential,
      provider: this.options.provider,
      clientName: this.options.clientName,
      capabilities: this.options.capabilities,
      ...(this.options.roleKey ? { roleKey: this.options.roleKey } : {})
    });

    this.token = response.connectorToken;
    const { connectorToken: _connectorToken, ...profile } = response;
    return profile;
  }

  async heartbeat(status: "online" | "offline" = "online") {
    return this.post<{ connectorId: string; status: string; lastSeenAt: string }>(
      "/agent-connectors/heartbeat",
      { status },
      { requiresToken: true, retryable: true }
    );
  }

  async recordEvent(input: AgentEventInput) {
    return this.post<AgentEvent>(
      "/agent-connectors/events",
      normalizeAgentEvent(input),
      { requiresToken: true }
    );
  }

  async recordEvents(inputs: AgentEventInput[]) {
    return this.post<{ events: AgentEvent[] }>(
      "/agent-connectors/events/batch",
      { events: inputs.map(normalizeAgentEvent) },
      { requiresToken: true, retryable: true }
    );
  }

  async readEventCursor(query: AgentEventCursorQuery = {}) {
    const search = new URLSearchParams();
    if (query.cursor) search.set("cursor", query.cursor);
    if (query.limit !== undefined) search.set("limit", String(query.limit));
    const suffix = search.size > 0 ? `?${search.toString()}` : "";
    return this.get<AgentEventCursorPage>(
      `/agent-connectors/events/cursor${suffix}`,
      { requiresToken: true, retryable: true }
    );
  }

  async claimTask(
    input: AgentTaskClaimRequest = {},
    signal?: AbortSignal
  ): Promise<AgentTaskLease | null> {
    const waitSeconds = input.waitSeconds ?? 25;
    return this.post<AgentTaskLease | null>(
      "/agent-connectors/tasks/claim",
      input,
      {
        requiresToken: true,
        acceptNoContent: true,
        signal,
        timeoutMs: Math.max(this.requestTimeoutMs, waitSeconds * 1_000 + 5_000)
      }
    );
  }

  async heartbeatTask(taskId: string, leaseToken: string) {
    return this.post<AgentTaskHeartbeatResponse>(
      `/agent-connectors/tasks/${encodeURIComponent(taskId)}/heartbeat`,
      { leaseToken },
      { requiresToken: true, retryable: true }
    );
  }

  async completeTask(taskId: string, leaseToken: string, result: unknown) {
    return this.post<AgentConnectorTask>(
      `/agent-connectors/tasks/${encodeURIComponent(taskId)}/complete`,
      { leaseToken, result },
      { requiresToken: true, retryable: true }
    );
  }

  async failTask(
    taskId: string,
    leaseToken: string,
    kind: AgentTaskFailureKind,
    error: string
  ) {
    return this.post<AgentConnectorTask>(
      `/agent-connectors/tasks/${encodeURIComponent(taskId)}/fail`,
      { leaseToken, kind, error },
      { requiresToken: true, retryable: true }
    );
  }

  private async post<T>(
    path: string,
    body: unknown,
    options: RequestOptions = {}
  ): Promise<T> {
    return this.request<T>(path, "POST", body, options);
  }

  private async get<T>(path: string, options: RequestOptions = {}): Promise<T> {
    return this.request<T>(path, "GET", undefined, options);
  }

  private async request<T>(
    path: string,
    method: "GET" | "POST",
    body: unknown,
    options: RequestOptions
  ): Promise<T> {
    if (options.requiresToken && !this.token) {
      throw new Error("Connector must connect before sending authenticated requests");
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json"
    };

    if (options.requiresToken) {
      headers["X-Agent-Connector-Token"] = this.token as string;
    }

    const requestTimeoutMs = options.timeoutMs ?? this.requestTimeoutMs;
    const attempts = options.retryable ? this.heartbeatMaxRetries + 1 : 1;
    let lastError: unknown;

    for (let attempt = 0; attempt < attempts; attempt += 1) {
      try {
        const response = await this.fetchWithTimeout(
          path,
          method,
          headers,
          body,
          requestTimeoutMs,
          options.signal
        );

        if (response.ok) {
          if (response.status === 204 && options.acceptNoContent) {
            return null as T;
          }
          return response.json() as Promise<T>;
        }

        if (
          options.retryable &&
          RETRYABLE_STATUS_CODES.has(response.status) &&
          attempt + 1 < attempts
        ) {
          await this.waitBeforeRetry(attempt);
          continue;
        }

        throw new Error(`Agent connector request failed: ${response.status}`);
      } catch (error) {
        lastError = error;
        if (options.signal?.aborted) {
          throw new Error("Agent connector request was cancelled");
        }
        if (!isTransportError(error)) throw error;
        if (!options.retryable || attempt + 1 >= attempts) {
          throw normalizeTransportError(error, requestTimeoutMs);
        }
        await this.waitBeforeRetry(attempt);
      }
    }

    throw normalizeTransportError(lastError, requestTimeoutMs);
  }

  private async fetchWithTimeout(
    path: string,
    method: "GET" | "POST",
    headers: Record<string, string>,
    body: unknown,
    timeoutMs: number,
    externalSignal?: AbortSignal
  ) {
    const controller = new AbortController();
    const handleExternalAbort = () => controller.abort(externalSignal?.reason);
    externalSignal?.addEventListener("abort", handleExternalAbort, { once: true });
    if (externalSignal?.aborted) handleExternalAbort();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(`${this.apiBaseUrl}${path}`, {
        method,
        headers,
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: controller.signal
      });
    } finally {
      clearTimeout(timeout);
      externalSignal?.removeEventListener("abort", handleExternalAbort);
    }
  }

  private waitBeforeRetry(attempt: number) {
    const delay = Math.min(this.retryDelayMs * 2 ** attempt, 2_000);
    return new Promise<void>((resolve) => setTimeout(resolve, delay));
  }
}

type RequestOptions = {
  requiresToken?: boolean;
  retryable?: boolean;
  acceptNoContent?: boolean;
  timeoutMs?: number;
  signal?: AbortSignal;
};

type ConnectionCredentialPayload = {
  version: 1;
  serverUrl: string;
  studentId: string;
  pairingSecret: string;
  expiresAt: string;
};

export function parseConnectionCredential(value: string) {
  const [prefix, encodedPayload, signature, ...rest] = value.split(".");
  if (prefix !== "agc1" || !encodedPayload || !signature || rest.length > 0) {
    throw new Error("Invalid connection credential");
  }

  let payload: unknown;
  try {
    payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"));
  } catch {
    throw new Error("Invalid connection credential");
  }

  if (
    !payload ||
    typeof payload !== "object" ||
    (payload as ConnectionCredentialPayload).version !== 1 ||
    typeof (payload as ConnectionCredentialPayload).serverUrl !== "string" ||
    typeof (payload as ConnectionCredentialPayload).studentId !== "string" ||
    typeof (payload as ConnectionCredentialPayload).pairingSecret !== "string" ||
    typeof (payload as ConnectionCredentialPayload).expiresAt !== "string"
  ) {
    throw new Error("Invalid connection credential");
  }

  const credential = payload as ConnectionCredentialPayload;
  const expiresAt = new Date(credential.expiresAt);
  if (Number.isNaN(expiresAt.getTime()) || expiresAt <= new Date()) {
    throw new Error("Connection credential is expired");
  }

  let serverUrl: URL;
  try {
    serverUrl = new URL(credential.serverUrl);
  } catch {
    throw new Error("Connection credential contains an invalid server URL");
  }
  if (
    (serverUrl.protocol !== "http:" && serverUrl.protocol !== "https:") ||
    serverUrl.username ||
    serverUrl.password ||
    serverUrl.pathname !== "/" ||
    serverUrl.search ||
    serverUrl.hash
  ) {
    throw new Error("Connection credential contains an invalid server URL");
  }

  return { ...credential, serverUrl: serverUrl.origin };
}

function isTransportError(error: unknown) {
  return !(error instanceof Error && error.message.startsWith("Agent connector request failed:"));
}

function normalizeTransportError(error: unknown, timeoutMs: number) {
  if (
    error instanceof Error &&
    (error.name === "AbortError" || error.name === "TimeoutError")
  ) {
    return new Error(`Agent connector request timed out after ${timeoutMs}ms`);
  }
  if (error instanceof Error) {
    return new Error(`Agent connector request could not be completed: ${error.message}`);
  }
  return new Error("Agent connector request could not be completed");
}

function positiveInteger(value: number | undefined, fallback: number) {
  return value !== undefined && Number.isInteger(value) && value > 0
    ? value
    : fallback;
}

function nonNegativeInteger(value: number | undefined, fallback: number) {
  return value !== undefined && Number.isInteger(value) && value >= 0
    ? value
    : fallback;
}

function boundedNonNegativeInteger(
  value: number | undefined,
  fallback: number,
  maximum: number
) {
  return Math.min(nonNegativeInteger(value, fallback), maximum);
}

function normalizeAgentEvent(input: AgentEventInput): NormalizedAgentEventInput {
  return {
    ...input,
    eventId: input.eventId ?? `connector-event-${randomUUID()}`,
    occurredAt: input.occurredAt ?? new Date().toISOString()
  };
}
