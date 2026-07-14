export type ConnectorProfile = {
  connectorId: string;
  agentSessionId: string;
  provider: string;
  clientName: string;
  status: "online" | "offline" | "revoked";
  capabilities: string[];
  connectedAt: string;
  lastSeenAt: string;
};

export type AgentEventInput = {
  dayId: string;
  type: string;
  payload: Record<string, unknown>;
  occurredAt?: string;
};

export type AgentEvent = AgentEventInput & {
  id: string;
  connectorId: string;
  studentId: string;
  createdAt: string;
  occurredAt: string;
};

type ConnectResponse = ConnectorProfile & {
  connectorToken: string;
};

export type AgentConnectorClientOptions = {
  connectionCredential: string;
  provider: string;
  clientName: string;
  capabilities: string[];
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
      capabilities: this.options.capabilities
    });

    this.token = response.connectorToken;
    const { connectorToken: _connectorToken, ...profile } = response;
    return profile;
  }

  async heartbeat(status: "online" | "offline" = "online") {
    return this.post<{ connectorId: string; status: string; lastSeenAt: string }>(
      "/agent-connectors/heartbeat",
      { status },
      true,
      true
    );
  }

  async recordEvent(input: AgentEventInput) {
    return this.post<AgentEvent>("/agent-connectors/events", input, true);
  }

  private async post<T>(
    path: string,
    body: unknown,
    requiresToken = false,
    retryable = false
  ) {
    if (requiresToken && !this.token) {
      throw new Error("Connector must connect before sending authenticated events");
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json"
    };

    if (requiresToken) {
      headers["X-Agent-Connector-Token"] = this.token as string;
    }

    const attempts = retryable ? this.heartbeatMaxRetries + 1 : 1;
    let lastError: unknown;

    for (let attempt = 0; attempt < attempts; attempt += 1) {
      try {
        const response = await this.fetchWithTimeout(path, headers, body);

        if (response.ok) {
          return response.json() as Promise<T>;
        }

        if (
          retryable &&
          RETRYABLE_STATUS_CODES.has(response.status) &&
          attempt + 1 < attempts
        ) {
          await this.waitBeforeRetry(attempt);
          continue;
        }

        throw new Error(`Agent connector request failed: ${response.status}`);
      } catch (error) {
        lastError = error;
        if (!isTransportError(error)) throw error;
        if (!retryable || attempt + 1 >= attempts) {
          throw normalizeTransportError(error, this.requestTimeoutMs);
        }
        await this.waitBeforeRetry(attempt);
      }
    }

    throw normalizeTransportError(lastError, this.requestTimeoutMs);
  }

  private async fetchWithTimeout(
    path: string,
    headers: Record<string, string>,
    body: unknown
  ) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.requestTimeoutMs);
    try {
      return await fetch(`${this.apiBaseUrl}${path}`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: controller.signal
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  private waitBeforeRetry(attempt: number) {
    const delay = Math.min(this.retryDelayMs * 2 ** attempt, 2_000);
    return new Promise<void>((resolve) => setTimeout(resolve, delay));
  }
}

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
