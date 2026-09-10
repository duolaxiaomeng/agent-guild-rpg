"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
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
  const [actionError, setActionError] = useState<string | null>(null);
  const [copyStatus, setCopyStatus] = useState<"copied" | "failed" | null>(null);

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
    // Production keeps the raw token exclusively in an HttpOnly cookie. The
    // local identity snapshot therefore has an empty token even though the
    // browser session is valid; authenticated API requests send that cookie
    // with `credentials: "include"`.
    if (!session) {
      setActionError("登录状态已失效，请重新登录后再生成连接凭证。");
      return;
    }

    setLoading(true);
    setActionError(null);
    setPairing(null);
    setCopyStatus(null);
    try {
      setPairing(await createAgentPairing(session.token));
      setDegraded(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      setActionError(
        message.includes(": 401")
          ? "登录状态已失效，请重新登录后再生成连接凭证。"
          : "连接凭证生成失败，请确认 API 服务已启动并重试。"
      );
      setDegraded(true);
    } finally {
      setLoading(false);
    }
  }

  async function copyCommand() {
    if (!pairing) return;

    try {
      await copyText(buildConnectorCommand(pairing));
      setCopyStatus("copied");
    } catch {
      setCopyStatus("failed");
    }
  }

  const statusLabel = profile
    ? `${providerLabel(profile.provider)} · ${profile.status === "online" ? "在线" : profile.status === "revoked" ? "已撤销" : "离线"}`
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

          <ConnectorControlPlaneStatus profile={profile} degraded={degraded} />

          {profile?.status === "online" ? (
            <nav aria-label="Agent 世界入口" style={worldEntranceStyle}>
              <Link href="/?zone=lobby" style={worldEntranceLinkStyle}>
                进入工作室大厅
              </Link>
              <Link href="/?zone=collab-room" style={worldEntranceLinkStyle}>
                进入协作区
              </Link>
            </nav>
          ) : null}

          {degraded ? (
            <p style={{ color: "#fca5a5", margin: "10px 0 0" }}>
              Agent 接入服务暂不可达，请稍后重试。
            </p>
          ) : null}

          {actionError ? (
            <p role="alert" style={{ color: "#fca5a5", margin: "10px 0 0" }}>
              {actionError}
            </p>
          ) : null}

          {!profile ? (
            <>
              <p style={{ color: "#cbd5e1", lineHeight: 1.5 }}>
                在本机运行 Codex CLI，通过一次性连接凭证接入办公室；Agent 会读取本地项目并自主选择工位角色。
              </p>
              <button
                type="button"
                onClick={() => void handleCreatePairing()}
                disabled={loading}
                style={primaryButtonStyle}
              >
                {loading ? "生成中..." : "生成连接凭证"}
              </button>
              {pairing ? (
                <PairingInstructions
                  pairing={pairing}
                  onCopy={copyCommand}
                  copyStatus={copyStatus}
                />
              ) : null}
            </>
          ) : (
            <>
              <p style={{ color: "#cbd5e1", margin: "10px 0 0" }}>
                {profile.clientName} · 最近心跳 {formatTime(profile.lastSeenAt)}
              </p>
              {profile.status !== "online" ? (
                <div style={reconnectStyle}>
                  <p style={{ margin: 0, color: "#fde68a", lineHeight: 1.5 }}>
                    {profile.status === "revoked"
                      ? "旧连接已撤销，需要生成新的单次连接凭证。"
                      : "Agent 已离线，原连接凭证不能重复使用，请重新生成。"}
                  </p>
                  <button
                    type="button"
                    onClick={() => void handleCreatePairing()}
                    disabled={loading}
                    style={{ ...primaryButtonStyle, marginTop: 10 }}
                  >
                    {loading ? "生成中..." : "重新生成连接凭证"}
                  </button>
                  {pairing ? (
                    <PairingInstructions
                      pairing={pairing}
                      onCopy={copyCommand}
                      copyStatus={copyStatus}
                    />
                  ) : null}
                </div>
              ) : null}
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
  onCopy,
  copyStatus
}: {
  pairing: AgentPairingResponse;
  onCopy: () => Promise<void>;
  copyStatus: "copied" | "failed" | null;
}) {
  return (
    <div style={pairingStyle}>
      <div style={{ color: "#9aafff", fontFamily: "var(--font-pixel)", fontSize: "10px", fontWeight: 800 }}>一次性连接凭证（已隐藏）</div>
      <code
        aria-label="连接凭证预览"
        style={credentialPreviewStyle}
      >
        {compactCredential(pairing.connectionCredential)}
      </code>
      <p style={{ color: "#94a3b8", lineHeight: 1.45, margin: "8px 0 0" }}>
        凭证 10 分钟内有效且只能使用一次。请复制完整连接命令并在项目根目录执行。
      </p>
      <button type="button" onClick={() => void onCopy()} style={secondaryButtonStyle}>
        {copyStatus === "copied" ? "已复制" : "复制连接命令"}
      </button>
      <details style={commandDetailsStyle}>
        <summary style={commandSummaryStyle}>手动查看完整启动命令</summary>
        <code style={commandStyle}>
          {buildConnectorCommand(pairing)}
        </code>
      </details>
      {copyStatus === "failed" ? (
        <p role="alert" style={{ margin: "8px 0 0", color: "#fca5a5" }}>
          自动复制失败，请展开完整启动命令后手动复制。
        </p>
      ) : null}
    </div>
  );
}

async function copyText(value: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();
  if (!copied) {
    throw new Error("Clipboard copy was rejected");
  }
}

function buildConnectorCommand(pairing: AgentPairingResponse) {
  return `AGENT_GUILD_CONNECTION_CREDENTIAL='${pairing.connectionCredential}' AGENT_GUILD_PROVIDER='codex-cli' AGENT_GUILD_CAPABILITIES='events,agent-task,provider-process' AGENT_GUILD_HEAVY_CAPACITY='1' pnpm --filter agent-connector start`;
}

function compactCredential(value: string) {
  if (value.length <= 24) return value;
  return `${value.slice(0, 12)}…${value.slice(-8)}`;
}

function ConnectorControlPlaneStatus({
  profile,
  degraded,
}: {
  profile: AgentConnectorProfile | null;
  degraded: boolean;
}) {
  const capabilities = new Set(profile?.capabilities ?? []);
  const connected = profile?.status === "online";
  const autonomous = connected
    && capabilities.has("agent-task")
    && capabilities.has("provider-process");
  const states = [
    {
      label: "API 控制面",
      value: degraded ? "暂不可达" : connected ? "已连接" : "已开放",
      ready: !degraded,
    },
    {
      label: "自主领取",
      value: autonomous ? "已开启" : connected ? "能力未声明" : "连接后启用",
      ready: autonomous,
    },
    {
      label: "本地执行",
      value: autonomous ? "已授权" : connected ? "仅事件上报" : "等待 Connector",
      ready: autonomous,
    },
    {
      label: "工位角色",
      value: profile?.roleKey ?? (connected ? "旧版未声明" : "Agent 自动选择"),
      ready: Boolean(profile?.roleKey),
    },
  ];

  return (
    <div aria-label="Agent 控制面状态" style={controlPlaneStyle}>
      {states.map((state) => (
        <div
          key={state.label}
          aria-label={`${state.label}：${state.value}`}
          style={controlPlaneItemStyle}
        >
          <span style={{ color: "#94a3b8", fontSize: 10 }}>{state.label}</span>
          <strong style={{ color: state.ready ? "#8ce7d5" : "#ffd789", fontSize: 11 }}>
            {state.value}
          </strong>
        </div>
      ))}
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
const controlPlaneStyle: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 6, marginTop: 12 };
const controlPlaneItemStyle: React.CSSProperties = { display: "grid", gap: 3, minWidth: 0, padding: "7px 6px", border: "1px solid rgba(150,178,221,0.16)", borderRadius: 4, background: "rgba(5,11,24,0.34)" };
const worldEntranceStyle: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 7, marginTop: 10 };
const worldEntranceLinkStyle: React.CSSProperties = { padding: "8px 9px", border: "1px solid rgba(80,214,186,0.4)", borderRadius: 4, background: "rgba(15,118,110,0.16)", color: "#bff7ec", fontSize: 11, fontWeight: 800, textAlign: "center", textDecoration: "none" };
const eventStyle: React.CSSProperties = { display: "flex", gap: 7, color: "#c5cfe1", fontSize: 12, lineHeight: 1.45 };
const pairingStyle: React.CSSProperties = { marginTop: 13, padding: 11, border: "1px solid rgba(150,178,221,0.18)", borderRadius: 5, background: "rgba(5,11,24,0.28)" };
const reconnectStyle: React.CSSProperties = { marginTop: 12, padding: 11, border: "1px solid rgba(248,189,88,0.3)", borderRadius: 5, background: "rgba(120,53,15,0.16)" };
const credentialPreviewStyle: React.CSSProperties = { display: "block", boxSizing: "border-box", width: "100%", minWidth: 0, marginTop: 4, padding: "7px 9px", overflow: "hidden", border: "1px solid rgba(80,214,186,0.34)", borderRadius: 4, background: "#020617", color: "#bff7ec", fontFamily: "var(--font-pixel)", fontSize: 11, lineHeight: 1.4, textOverflow: "ellipsis", whiteSpace: "nowrap" };
const commandDetailsStyle: React.CSSProperties = { maxWidth: "100%", marginTop: 9, color: "#94a3b8" };
const commandSummaryStyle: React.CSSProperties = { cursor: "pointer", fontSize: 11, fontWeight: 700 };
const commandStyle: React.CSSProperties = { display: "block", boxSizing: "border-box", width: "100%", minWidth: 0, marginTop: 7, padding: 9, overflowX: "auto", border: "1px solid rgba(150,178,221,0.17)", borderRadius: 4, background: "#020617", color: "#bfdbfe", fontSize: 11, lineHeight: 1.55, whiteSpace: "nowrap" };
