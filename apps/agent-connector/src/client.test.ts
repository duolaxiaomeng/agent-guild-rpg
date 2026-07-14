import { afterEach, describe, expect, it, vi } from "vitest";
import { AgentConnectorClient } from "./client.js";

function response(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body
  } as Response;
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
      response({
        connectorId: "connector-1",
        agentSessionId: "session-1",
        connectorToken: "connector-secret",
        provider: "codex-cli",
        clientName: "lin-mac",
        status: "online",
        capabilities: ["events"],
        connectedAt: "2026-07-12T04:00:00.000Z",
        lastSeenAt: "2026-07-12T04:00:00.000Z"
      })
    );

    const client = new AgentConnectorClient({
      connectionCredential: connectionCredential(),
      provider: "codex-cli",
      clientName: "lin-mac",
      capabilities: ["events"]
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
          capabilities: ["events"]
        })
      })
    );
  });

  it("sends heartbeats and Day events with the connector token", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(
      async (input) => {
        const url = String(input);
        if (url.endsWith("/connect")) {
          return response({
            connectorId: "connector-1",
            agentSessionId: "session-1",
            connectorToken: "connector-secret",
            provider: "codex-cli",
            clientName: "lin-mac",
            status: "online",
            capabilities: ["events"],
            connectedAt: "2026-07-12T04:00:00.000Z",
            lastSeenAt: "2026-07-12T04:00:00.000Z"
          });
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
        body: JSON.stringify({
          dayId: "day-1",
          type: "run.started",
          payload: { instruction: "Inspect the project" }
        })
      })
    );
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
      .mockResolvedValueOnce(
        response({
          connectorId: "connector-1",
          agentSessionId: "session-1",
          connectorToken: "connector-secret",
          provider: "codex-cli",
          clientName: "lin-mac",
          status: "online",
          capabilities: ["events"],
          connectedAt: "2026-07-12T04:00:00.000Z",
          lastSeenAt: "2026-07-12T04:00:00.000Z"
        })
      )
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
});
