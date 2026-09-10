import { afterEach, describe, expect, it, vi } from "vitest";
import { AgentConnectorClient } from "./client.js";

function response(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body
  } as Response;
}

function connectedProfile() {
  return {
    connectorId: "connector-1",
    agentSessionId: "session-1",
    connectorToken: "connector-secret",
    provider: "codex-cli",
    clientName: "lin-mac",
    status: "online",
    capabilities: ["events", "agent-task", "provider-process"],
    roleKey: "frontend-developer",
    visualRole: "coder",
    connectedAt: "2026-07-12T04:00:00.000Z",
    lastSeenAt: "2026-07-12T04:00:00.000Z"
  };
}

function connectionCredential(serverUrl = "http://localhost:3001") {
  const payload = Buffer.from(JSON.stringify({
    version: 1,
    serverUrl,
    studentId: "student-1",
    pairingSecret: "pairing-secret",
    expiresAt: "2030-07-12T04:10:00.000Z"
  })).toString("base64url");
  return `agc1.${payload}.test-signature`;
}

describe("AgentConnectorClient", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("connects with one credential and keeps the connector token private", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      response(connectedProfile())
    );

    const client = new AgentConnectorClient({
      connectionCredential: connectionCredential(),
      provider: "codex-cli",
      clientName: "lin-mac",
      capabilities: ["events"],
      roleKey: "frontend-developer",
    });

    const profile = await client.connect();

    expect(profile.connectorId).toBe("connector-1");
    expect(client.connectorToken).toBe("connector-secret");
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:3001/agent-connectors/connect",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          connectionCredential: connectionCredential(),
          provider: "codex-cli",
          clientName: "lin-mac",
          capabilities: ["events"],
          roleKey: "frontend-developer"
        })
      })
    );
  });

  it("sends heartbeats and Day events with the connector token", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(
      async (input) => {
        const url = String(input);
        if (url.endsWith("/connect")) {
          return response(connectedProfile());
        }

        return response({
          connectorId: "connector-1",
          status: "online",
          lastSeenAt: "2026-07-12T04:00:01.000Z"
        });
      }
    );

    const client = new AgentConnectorClient({
      connectionCredential: connectionCredential("http://localhost:3001/"),
      provider: "codex-cli",
      clientName: "lin-mac",
      capabilities: ["events"]
    });

    await client.connect();
    await client.heartbeat();
    await client.recordEvent({
      dayId: "day-1",
      type: "run.started",
      payload: { instruction: "Inspect the project" }
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:3001/agent-connectors/heartbeat",
      expect.objectContaining({
        headers: expect.objectContaining({
          "X-Agent-Connector-Token": "connector-secret"
        })
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:3001/agent-connectors/events",
      expect.objectContaining({
        headers: expect.objectContaining({
          "X-Agent-Connector-Token": "connector-secret"
        }),
        body: expect.stringContaining('"dayId":"day-1"')
      })
    );
    const eventRequest = fetchMock.mock.calls[2]?.[1];
    const eventBody = JSON.parse(String(eventRequest?.body));
    expect(eventBody).toMatchObject({
      dayId: "day-1",
      type: "run.started",
      payload: { instruction: "Inspect the project" }
    });
    expect(eventBody.eventId).toMatch(/^connector-event-/);
    expect(new Date(eventBody.occurredAt).toISOString()).toBe(eventBody.occurredAt);
  });

  it("aborts a request after the configured timeout without retrying connect", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation((_input, init) => {
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener(
            "abort",
            () => {
              const error = new Error("aborted");
              error.name = "AbortError";
              reject(error);
            },
            { once: true }
          );
        });
      });

    const client = new AgentConnectorClient({
      connectionCredential: connectionCredential(),
      provider: "codex-cli",
      clientName: "lin-mac",
      capabilities: ["events"],
      requestTimeoutMs: 10
    });

    await expect(client.connect()).rejects.toThrow(/timed out after 10ms/i);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries only the idempotent heartbeat on retryable responses", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(response(connectedProfile()))
      .mockResolvedValueOnce(response({}, 503))
      .mockResolvedValueOnce(
        response({
          connectorId: "connector-1",
          status: "online",
          lastSeenAt: "2026-07-12T04:00:01.000Z"
        })
      )
      .mockResolvedValueOnce(response({}, 503));

    const client = new AgentConnectorClient({
      connectionCredential: connectionCredential(),
      provider: "codex-cli",
      clientName: "lin-mac",
      capabilities: ["events"],
      heartbeatMaxRetries: 1,
      retryDelayMs: 0
    });

    await client.connect();
    await expect(client.heartbeat()).resolves.toMatchObject({ status: "online" });
    await expect(
      client.recordEvent({
        dayId: "day-1",
        type: "run.started",
        payload: {}
      })
    ).rejects.toThrow(/503/);

    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("uses idempotent event batches and an authenticated cursor", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(response(connectedProfile()))
      .mockResolvedValueOnce(response({ events: [] }))
      .mockResolvedValueOnce(response({ events: [], nextCursor: null }));
    const client = new AgentConnectorClient({
      connectionCredential: connectionCredential(),
      provider: "codex-cli",
      clientName: "lin-mac",
      capabilities: ["events"]
    });

    await client.connect();
    await client.recordEvents([
      { eventId: "event-1", dayId: "day-1", type: "run.started", payload: {} }
    ]);
    await client.readEventCursor({ cursor: "cursor/1", limit: 20 });

    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "http://localhost:3001/agent-connectors/events/batch",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "X-Agent-Connector-Token": "connector-secret"
        })
      })
    );
    const batchBody = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body));
    expect(batchBody.events[0]).toMatchObject({
      eventId: "event-1",
      dayId: "day-1"
    });
    expect(batchBody.events[0].occurredAt).toBeTruthy();
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "http://localhost:3001/agent-connectors/events/cursor?cursor=cursor%2F1&limit=20",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({
          "X-Agent-Connector-Token": "connector-secret"
        })
      })
    );
  });

  it("maps a 204 long-poll response to no task", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(response(connectedProfile()))
      .mockResolvedValueOnce(response(undefined, 204));
    const client = new AgentConnectorClient({
      connectionCredential: connectionCredential(),
      provider: "codex-cli",
      clientName: "lin-mac",
      capabilities: ["agent-task"]
    });

    await client.connect();
    await expect(
      client.claimTask({ lightCapacity: 1, heavyCapacity: 0, waitSeconds: 25 })
    ).resolves.toBeNull();

    expect(fetchMock).toHaveBeenLastCalledWith(
      "http://localhost:3001/agent-connectors/tasks/claim",
      expect.objectContaining({
        body: JSON.stringify({
          lightCapacity: 1,
          heavyCapacity: 0,
          waitSeconds: 25
        }),
        headers: expect.objectContaining({
          "X-Agent-Connector-Token": "connector-secret"
        })
      })
    );
  });

  it("sends lease heartbeats and idempotent terminal task results", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(response(connectedProfile()))
      .mockResolvedValue(response({ id: "task/1", status: "completed" }));
    const client = new AgentConnectorClient({
      connectionCredential: connectionCredential(),
      provider: "codex-cli",
      clientName: "lin-mac",
      capabilities: ["agent-task"]
    });

    await client.connect();
    await client.heartbeatTask("task/1", "lease-secret");
    await client.completeTask("task/1", "lease-secret", { output: "done" });
    await client.failTask(
      "task/1",
      "lease-secret",
      "infrastructure",
      "temporary provider failure"
    );

    expect(fetchMock.mock.calls.slice(1).map(([url]) => String(url))).toEqual([
      "http://localhost:3001/agent-connectors/tasks/task%2F1/heartbeat",
      "http://localhost:3001/agent-connectors/tasks/task%2F1/complete",
      "http://localhost:3001/agent-connectors/tasks/task%2F1/fail"
    ]);
    expect(fetchMock.mock.calls[2]?.[1]?.body).toBe(
      JSON.stringify({ leaseToken: "lease-secret", result: { output: "done" } })
    );
    expect(fetchMock.mock.calls[3]?.[1]?.body).toBe(
      JSON.stringify({
        leaseToken: "lease-secret",
        kind: "infrastructure",
        error: "temporary provider failure"
      })
    );
  });
});
