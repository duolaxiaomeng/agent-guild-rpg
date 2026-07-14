import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AgentConnectorPanel } from "./agent-connector-panel";

describe("AgentConnectorPanel", () => {
  beforeEach(() => {
    window.localStorage.setItem(
      "agent-guild-session",
      JSON.stringify({
        token: "session_student-1",
        user: { id: "student-1", role: "student", displayName: "Lin" }
      })
    );
  });

  afterEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it("generates one connection credential from the student's office", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith("/agent-connectors/me")) {
        return { ok: true, json: async () => null } as Response;
      }
      if (url.endsWith("/agent-connectors/pairing")) {
        return {
          ok: true,
          json: async () => ({
            connectionCredential: "agc1.credential-payload.signature",
            expiresAt: "2026-07-12T04:10:00.000Z"
          })
        } as Response;
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    render(<AgentConnectorPanel dayId="day-1" />);

    fireEvent.click(await screen.findByRole("button", { name: "接入我的 Agent" }));
    fireEvent.click(screen.getByRole("button", { name: "生成连接凭证" }));

    await waitFor(() => {
      expect(screen.getByText("agc1.credential-payload.signature")).toBeInTheDocument();
    });
    expect(fetchSpy).toHaveBeenCalledWith(
      "http://localhost:3001/agent-connectors/pairing",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer session_student-1"
        })
      })
    );
  });

  it("shows an online connector and its latest Day event", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith("/agent-connectors/me")) {
        return {
          ok: true,
          json: async () => ({
            connectorId: "connector-1",
            agentSessionId: "session-1",
            provider: "codex-cli",
            clientName: "lin-mac",
            status: "online",
            capabilities: ["events"],
            connectedAt: "2026-07-12T04:00:00.000Z",
            lastSeenAt: "2026-07-12T04:00:00.000Z"
          })
        } as Response;
      }
      if (url.includes("/agent-connectors/events")) {
        return {
          ok: true,
          json: async () => [
            {
              id: "event-1",
              connectorId: "connector-1",
              studentId: "student-1",
              dayId: "day-1",
              type: "run.started",
              payload: {},
              occurredAt: "2026-07-12T04:00:00.000Z",
              createdAt: "2026-07-12T04:00:00.000Z"
            }
          ]
        } as Response;
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    render(<AgentConnectorPanel dayId="day-1" />);
    fireEvent.click(await screen.findByRole("button", { name: "接入我的 Agent" }));

    expect(await screen.findByText("Codex CLI · 在线")).toBeInTheDocument();
    expect(await screen.findByText("已开始执行 Day 1")).toBeInTheDocument();
  });

  it("lets a teacher manage an embedded personal Agent connection", async () => {
    window.localStorage.setItem(
      "agent-guild-session",
      JSON.stringify({
        token: "session_teacher-1",
        user: { id: "teacher-1", role: "teacher", displayName: "Teacher Lin" }
      })
    );
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => null
    } as Response);

    render(
      <AgentConnectorPanel
        dayId="day-2"
        variant="embedded"
        title="老师 Agent"
      />
    );

    expect(screen.getByRole("heading", { name: "老师 Agent" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "生成连接凭证" })).toBeInTheDocument();
    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        "http://localhost:3001/agent-connectors/me",
        expect.objectContaining({
          headers: { Authorization: "Bearer session_teacher-1" }
        })
      );
    });
  });
});
