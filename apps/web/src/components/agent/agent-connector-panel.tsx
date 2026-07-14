"use client";

import { useEffect, useState } from "react";
import {
  createAgentPairing,
  getAgentConnectorProfileSafe,
  getAgentEventsSafe,
  type AgentConnectorProfile,
  type AgentEvent,
  type AgentPairingResponse
} from "../../lib/api-client";
import { loadSession } from "../../lib/session";

type AgentConnectorPanelProps = {
  dayId: string;
  variant?: "world" | "embedded";
  title?: string;
};

export function AgentConnectorPanel({
  dayId,
  variant = "world",
  title = "我的 Agent"
}: AgentConnectorPanelProps) {
  const [expanded, setExpanded] = useState(variant === "embedded");
  const [profile, setProfile] = useState<AgentConnectorProfile | null>(null);
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const [pairing, setPairing] = useState<AgentPairingResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [degraded, setDegraded] = useState(false);

  useEffect(() => {
    let disposed = false;

    async function refresh() {
      const session = loadSession();
      if (!session) return;

      const profileResult = await getAgentConnectorProfileSafe(session.token);
      if (disposed) return;

      setProfile(profileResult.data);
      setDegraded(profileResult.degraded);

      if (profileResult.data && profileResult.data.status !== "revoked") {
        const eventsResult = await getAgentEventsSafe(dayId, session.token);
        if (!disposed) setEvents(eventsResult.data.slice(-5).reverse());
      }
    }

    void refresh();
    const timer = setInterval(() => void refresh(), 15000);
    return () => {
      disposed = true;
      clearInterval(timer);
    };
  }, [dayId]);

  async function handleCreatePairing() {
    const session = loadSession();
    if (!session) return;

    setLoading(true);
    try {
      setPairing(await createAgentPairing(session.token));
      setDegraded(false);
    } catch {
      setDegraded(true);
    } finally {
      setLoading(false);
    }
  }

  async function copyCommand() {
    if (!pairing || !navigator.clipboard) return;

    await navigator.clipboard.writeText(
      `AGENT_GUILD_CONNECTION_CREDENTIAL='${pairing.connectionCredential}' pnpm --filter agent-connector start`
    );
  }

  const statusLabel = profile
    ? `${providerLabel(profile.provider)} · ${profile.status === "online" ? "在线" : "离线"}`
    : "尚未接入";

  return (
    <section
      aria-label="Agent 接入"
      style={{
        position: variant === "embedded" ? "relative" : "absolute",
        top: variant === "embedded" ? undefined : "88px",
        left: variant === "embedded" ? undefined : "16px",
        zIndex: variant === "embedded" ? undefined : 20,
        width: variant === "embedded"
          ? "100%"
          : expanded
            ? "min(348px, calc(100vw - 32px))"
            : "auto",
        marginTop: variant === "embedded" ? "24px" : undefined,
        color: "#eef2ff",
        fontSize: "13px"
      }}
    >
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => setExpanded((value) => !value)}
        style={{
          minHeight: 38,
          padding: "8px 12px",
          borderRadius: "5px",
          border: "1px solid rgba(80,214,186,0.42)",
          background: "linear-gradient(145deg, rgba(18,43,55,0.94), rgba(7,19,31,0.94))",
          color: "#f8fafc",
          cursor: "pointer",
          fontFamily: "var(--font-pixel)",
          fontSize: 11,
          fontWeight: 800,
          boxShadow: "0 3px 0 rgba(3,6,14,0.55), 0 8px 22px rgba(0,0,0,0.28)"
        }}
      >
        {expanded ? "收起 Agent 接入" : "接入我的 Agent"}
      </button>

      {expanded ? (
        <div
          style={{
            marginTop: "8px",
            padding: "16px",
            borderRadius: "7px",
            border: "1px solid rgba(100,183,255,0.34)",
            borderTop: "3px solid #64b7ff",
            background: "linear-gradient(145deg, rgba(13,24,48,0.97), rgba(5,11,24,0.97))",
            boxShadow: "0 5px 0 rgba(3,6,14,0.55), 0 16px 35px rgba(0,0,0,0.3)"
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", gap: "12px" }}>
            <h2 style={{ margin: 0, fontFamily: "var(--font-pixel)", fontSize: variant === "embedded" ? 18 : 14 }}>{title}</h2>
            <span style={{ ...statusBadgeStyle, color: profile?.status === "online" ? "#8ce7d5" : "#ffd789", borderColor: profile?.status === "online" ? "rgba(80,214,186,0.38)" : "rgba(248,189,88,0.38)" }}>
              <span aria-hidden="true">●</span>
              {statusLabel}
            </span>
          </div>

          {degraded ? (
            <p style={{ color: "#fca5a5", margin: "10px 0 0" }}>
              Agent 接入服务暂不可达，请稍后重试。
            </p>
          ) : null}

          {!profile ? (
            <>
              <p style={{ color: "#cbd5e1", lineHeight: 1.5 }}>
                在本机运行 Codex CLI，通过一条一次性连接凭证把当前 Agent 接入这个办公室。
              </p>
              <button
                type="button"
                onClick={() => void handleCreatePairing()}
                disabled={loading}
                style={primaryButtonStyle}
              >
                {loading ? "生成中..." : "生成连接凭证"}
              </button>
              {pairing ? <PairingInstructions pairing={pairing} onCopy={copyCommand} /> : null}
            </>
          ) : (
            <>
              <p style={{ color: "#cbd5e1", margin: "10px 0 0" }}>
                {profile.clientName} · 最近心跳 {formatTime(profile.lastSeenAt)}
              </p>
              {events.length > 0 ? (
                <div style={eventListStyle}>
                  <div style={{ color: "#9aafff", fontFamily: "var(--font-pixel)", fontSize: 11, fontWeight: 800 }}>DAY {dayId.replace("day-", "")} / 动态</div>
                  {events.map((event) => (
                    <div key={event.id} style={eventStyle}>
                      <span aria-hidden="true" style={{ color: "#50d6ba" }}>›</span>
                      {eventLabel(event, dayId)}
                    </div>
                  ))}
                </div>
              ) : (
                <p style={{ color: "#94a3b8", margin: "10px 0 0" }}>等待 Agent 回传第一条任务动态。</p>
              )}
            </>
          )}
        </div>
      ) : null}
    </section>
  );
}

function PairingInstructions({
  pairing,
  onCopy
}: {
  pairing: AgentPairingResponse;
  onCopy: () => Promise<void>;
}) {
  return (
    <div style={pairingStyle}>
      <div style={{ color: "#9aafff", fontFamily: "var(--font-pixel)", fontSize: "10px", fontWeight: 800 }}>一次性连接凭证</div>
      <code
        style={{
          display: "block",
          marginTop: "4px",
          padding: "10px",
          border: "1px solid rgba(80,214,186,0.34)",
          borderRadius: "4px",
          background: "#020617",
          color: "#bff7ec",
          fontFamily: "var(--font-pixel)",
          fontSize: "11px",
          lineHeight: 1.5,
          wordBreak: "break-all"
        }}
      >
        {pairing.connectionCredential}
      </code>
      <p style={{ color: "#94a3b8", lineHeight: 1.45 }}>
        在项目根目录执行下面命令。凭证已包含服务器地址和当前账号绑定信息，10 分钟内有效且只能使用一次。
      </p>
      <code style={commandStyle}>
        AGENT_GUILD_CONNECTION_CREDENTIAL='{pairing.connectionCredential}' pnpm --filter agent-connector start
      </code>
      <button type="button" onClick={() => void onCopy()} style={secondaryButtonStyle}>
        复制连接命令
      </button>
    </div>
  );
}

function providerLabel(provider: string) {
  if (provider === "codex-cli") return "Codex CLI";
  return provider;
}

function eventLabel(event: AgentEvent, dayId: string) {
  if (event.type === "run.started") return `已开始执行 Day ${dayId.replace("day-", "")}`;
  if (event.type === "run.finished") return "已完成一次 Agent 运行";
  if (event.type === "test.completed") return "测试结果已回传";
  if (event.type === "artifact.created") return "产生了新的任务成果";
  return `Agent 动态：${event.type}`;
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

const primaryButtonStyle: React.CSSProperties = {
  minHeight: 36,
  padding: "8px 12px",
  border: "1px solid rgba(100,183,255,0.52)",
  borderRadius: "5px",
  background: "rgba(100,183,255,0.16)",
  color: "#fff",
  cursor: "pointer",
  fontWeight: 800,
  boxShadow: "0 2px 0 rgba(3,6,14,0.42)"
};

const secondaryButtonStyle: React.CSSProperties = {
  ...primaryButtonStyle,
  marginTop: "10px",
  background: "rgba(118,146,255,0.12)"
};
const statusBadgeStyle: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 7px", border: "1px solid", borderRadius: 999, background: "rgba(5,11,24,0.32)", fontSize: 10, fontWeight: 800, whiteSpace: "nowrap" };
const eventListStyle: React.CSSProperties = { display: "grid", gap: 7, marginTop: 12, padding: 11, border: "1px solid rgba(150,178,221,0.17)", borderRadius: 5, background: "rgba(5,11,24,0.3)" };
const eventStyle: React.CSSProperties = { display: "flex", gap: 7, color: "#c5cfe1", fontSize: 12, lineHeight: 1.45 };
const pairingStyle: React.CSSProperties = { marginTop: 13, padding: 11, border: "1px solid rgba(150,178,221,0.18)", borderRadius: 5, background: "rgba(5,11,24,0.28)" };
const commandStyle: React.CSSProperties = { display: "block", padding: 9, border: "1px solid rgba(150,178,221,0.17)", borderRadius: 4, background: "#020617", color: "#bfdbfe", fontSize: 11, lineHeight: 1.55, wordBreak: "break-word" };
