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

    const credentialPreview = await screen.findByLabelText("连接凭证预览");
    expect(credentialPreview).toHaveTextContent("…");
    expect(credentialPreview).not.toHaveTextContent("agc1.credential-payload.signature");
    expect(screen.queryByText("agc1.credential-payload.signature")).not.toBeInTheDocument();
    expect(
      screen.getByText("手动查看完整启动命令").closest("details")
    ).not.toHaveAttribute("open");
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

  it("copies the connector command on an HTTP LAN page without Clipboard API", async () => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: undefined
    });
    const execCommand = vi.fn(() => true);
    Object.defineProperty(document, "execCommand", {
      configurable: true,
      value: execCommand
    });
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith("/agent-connectors/me")) {
        return { ok: true, json: async () => null } as Response;
      }
      if (url.endsWith("/agent-connectors/pairing")) {
        return {
          ok: true,
          json: async () => ({
            connectionCredential: "agc1.lan-credential.signature",
            expiresAt: "2026-07-15T16:00:00.000Z"
          })
        } as Response;
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    render(<AgentConnectorPanel dayId="day-1" />);
    fireEvent.click(await screen.findByRole("button", { name: "接入我的 Agent" }));
    fireEvent.click(screen.getByRole("button", { name: "生成连接凭证" }));
    await screen.findByLabelText("连接凭证预览");
    fireEvent.click(screen.getByRole("button", { name: "复制连接命令" }));

    await screen.findByRole("button", { name: "已复制" });
    expect(execCommand).toHaveBeenCalledWith("copy");
  });

  it("uses the HttpOnly session cookie when production storage omits the token", async () => {
    window.localStorage.setItem(
      "agent-guild-session",
      JSON.stringify({
        token: "",
        user: { id: "student-real", role: "student", displayName: "真实学生" }
      })
    );
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith("/agent-connectors/me")) {
        return { ok: true, json: async () => null } as Response;
      }
      if (url.endsWith("/agent-connectors/pairing")) {
        return {
          ok: true,
          json: async () => ({
            connectionCredential: "agc1.cookie-session.signature",
            expiresAt: "2026-07-15T16:00:00.000Z"
          })
        } as Response;
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    render(<AgentConnectorPanel dayId="day-1" />);
    fireEvent.click(await screen.findByRole("button", { name: "接入我的 Agent" }));
    fireEvent.click(screen.getByRole("button", { name: "生成连接凭证" }));

    expect(await screen.findByLabelText("连接凭证预览")).toHaveTextContent("…");
    expect(fetchSpy).toHaveBeenCalledWith(
      "http://localhost:3001/agent-connectors/pairing",
      expect.objectContaining({
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" }
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
            capabilities: ["events", "agent-task", "provider-process"],
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
    expect(await screen.findByLabelText("API 控制面：已连接")).toBeInTheDocument();
    expect(await screen.findByLabelText("自主领取：已开启")).toBeInTheDocument();
    expect(await screen.findByLabelText("本地执行：已授权")).toBeInTheDocument();
    expect(await screen.findByText("已开始执行 Day 1")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "进入工作室大厅" })).toHaveAttribute(
      "href",
      "/?zone=lobby",
    );
    expect(screen.getByRole("link", { name: "进入协作区" })).toHaveAttribute(
      "href",
      "/?zone=collab-room",
    );
    expect(screen.queryByRole("button", { name: "重新生成连接凭证" })).not.toBeInTheDocument();
  });

  it.each([
    ["offline", "Codex CLI · 离线"],
    ["revoked", "Codex CLI · 已撤销"],
  ] as const)("regenerates a one-time credential when the connector is %s", async (status, statusLabel) => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith("/agent-connectors/me")) {
        return {
          ok: true,
          json: async () => ({
            connectorId: "connector-old",
            agentSessionId: "session-old",
            provider: "codex-cli",
            clientName: "lin-mac",
            status,
            capabilities: ["events", "agent-task", "provider-process"],
            connectedAt: "2026-07-12T04:00:00.000Z",
            lastSeenAt: "2026-07-12T04:00:00.000Z"
          })
        } as Response;
      }
      if (url.includes("/agent-connectors/events")) {
        return { ok: true, json: async () => [] } as Response;
      }
      if (url.endsWith("/agent-connectors/pairing")) {
        return {
          ok: true,
          json: async () => ({
            connectionCredential: `agc1.${status}.new-signature`,
            expiresAt: "2026-07-15T18:10:00.000Z"
          })
        } as Response;
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    render(<AgentConnectorPanel dayId="day-1" />);
    fireEvent.click(await screen.findByRole("button", { name: "接入我的 Agent" }));

    expect(await screen.findByText(statusLabel)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "重新生成连接凭证" }));

    expect(await screen.findByLabelText("连接凭证预览")).toHaveTextContent("…");
    expect(fetchSpy).toHaveBeenCalledWith(
      "http://localhost:3001/agent-connectors/pairing",
      expect.objectContaining({ method: "POST" })
    );
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
