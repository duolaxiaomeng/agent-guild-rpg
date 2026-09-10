"use client";

import { useState, type CSSProperties } from "react";
import {
  clearAgentTeamBinding,
  setAgentTeamBinding,
  type AgentTeamBinding,
  type AgentTeamRosterMember,
} from "../../lib/api-client";

export type AgentTeamStatus = "online" | "idle" | "running";

export type AgentTeamMember = {
  id: string;
  name: string;
  icon: string;
  responsibility: string;
  capabilities: string[];
  status: AgentTeamStatus;
  concurrentTasks: number;
  visualRole?: "browser" | "coder" | "files" | "ops" | "lead";
};

export type AgentTeamPanelProps = {
  agents: AgentTeamMember[];
  defaultExpanded?: boolean;
  token?: string;
  initialBinding?: AgentTeamBinding | null;
  canBind?: boolean;
  onlineMembers?: AgentTeamRosterMember[];
  onSelectAgent?: (agent: AgentTeamMember) => void;
  onViewDetails?: (agent: AgentTeamMember) => void;
};

const statusColors: Record<AgentTeamStatus, string> = {
  online: "#67e8a5",
  idle: "#f5c76b",
  running: "#67b7ff"
};

const panelStyle: CSSProperties = {
  width: "100%",
  color: "#f3f1ff",
  background: "rgba(13, 22, 45, 0.94)",
  border: "1px solid rgba(150, 178, 221, 0.3)",
  borderRadius: 10,
  boxShadow: "0 6px 0 rgba(7, 9, 24, 0.58), inset 0 0 0 1px rgba(115, 133, 196, 0.1)",
  fontSize: 13
};

const headerStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  width: "100%",
  minHeight: 72,
  padding: "15px clamp(14px, 3vw, 22px)",
  border: 0,
  background: "transparent",
  color: "inherit",
  textAlign: "left",
  cursor: "pointer"
};

const eyebrowStyle: CSSProperties = {
  display: "block",
  marginBottom: 4,
  color: "#9aa8d8",
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: "0.12em",
  textTransform: "uppercase"
};

const titleStyle: CSSProperties = {
  margin: 0,
  color: "#fff",
  fontSize: 18,
  lineHeight: 1.1,
  letterSpacing: "0.02em"
};

const summaryStyle: CSSProperties = {
  color: "#aeb8df",
  fontSize: 12,
  whiteSpace: "nowrap"
};

const chevronStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 26,
  height: 26,
  marginLeft: 8,
  border: "1px solid rgba(154,175,255,0.5)",
  borderRadius: 4,
  background: "rgba(118,146,255,0.08)",
  color: "#dce4ff",
  fontSize: 16,
  lineHeight: 1
};

const rosterStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 310px), 1fr))",
  gap: 12,
  padding: "0 12px 14px"
};

const cardStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "48px minmax(0, 1fr)",
  gap: 12,
  alignItems: "start",
  minHeight: 218,
  padding: 14,
  background: "linear-gradient(145deg, rgba(36, 52, 91, 0.88), rgba(20, 32, 63, 0.9))",
  border: "1px solid rgba(116, 137, 205, 0.42)",
  borderRadius: 6,
  boxShadow: "0 4px 0 rgba(5, 8, 22, 0.48), inset 0 1px rgba(255,255,255,0.035)"
};

const iconStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: 48,
  height: 48,
  background: "linear-gradient(145deg, #354b88, #202c57)",
  border: "2px solid #8499df",
  borderRadius: 5,
  color: "#f5d982",
  fontFamily: "var(--font-pixel)",
  fontSize: 12,
  fontWeight: 800,
  letterSpacing: "0.06em",
  boxShadow: "inset 0 -5px rgba(7,9,24,0.26), 0 3px 0 rgba(5,8,22,0.42)"
};

const nameStyle: CSSProperties = {
  margin: 0,
  color: "#fff",
  fontFamily: "var(--font-pixel)",
  fontSize: 15,
  lineHeight: 1.2
};

const responsibilityStyle: CSSProperties = {
  minHeight: 38,
  margin: "5px 0 9px",
  color: "#bdc7e8",
  lineHeight: 1.35
};

const statusStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 5,
  marginRight: 10,
  fontSize: 11,
  fontWeight: 700
};

const capabilityListStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 5,
  marginTop: 9
};

const capabilityStyle: CSSProperties = {
  padding: "4px 7px",
  border: "1px solid rgba(150, 169, 231, 0.4)",
  borderRadius: 999,
  background: "rgba(5,11,24,0.22)",
  color: "#d5ddff",
  fontSize: 10,
  lineHeight: 1
};

const taskStyle: CSSProperties = {
  color: "#f5d982",
  fontSize: 11,
  whiteSpace: "nowrap"
};

const actionStyle: CSSProperties = {
  display: "flex",
  gridColumn: "1 / -1",
  gap: 6,
  marginTop: "auto"
};

const buttonStyle: CSSProperties = {
  flex: 1,
  minHeight: 34,
  padding: "7px 9px",
  border: "1px solid #7084c4",
  borderRadius: 4,
  background: "rgba(15, 22, 51, 0.82)",
  color: "#eef2ff",
  cursor: "pointer",
  fontSize: 11,
  fontWeight: 700,
  whiteSpace: "nowrap",
  boxShadow: "0 2px 0 rgba(5,8,22,0.42)",
  transition: "border-color 120ms ease, background-color 120ms ease, transform 120ms ease"
};

const selectedButtonStyle: CSSProperties = {
  ...buttonStyle,
  borderColor: "#f5d982",
  background: "rgba(246,200,95,0.14)",
  color: "#fff7d6",
  boxShadow: "inset 0 0 0 1px rgba(246,200,95,0.12), 0 2px 0 rgba(5,8,22,0.42)"
};

const selectedBadgeStyle: CSSProperties = {
  display: "inline-block",
  margin: "5px 0 0",
  padding: "3px 6px",
  borderRadius: 999,
  background: "rgba(103,232,165,0.12)",
  color: "#8ce7d5",
  fontSize: 10,
  fontWeight: 800,
};

const warningStyle: CSSProperties = {
  gridColumn: "1 / -1",
  margin: 0,
  padding: "8px 10px",
  border: "1px solid rgba(248,189,88,0.34)",
  borderRadius: 5,
  background: "rgba(248,189,88,0.08)",
  color: "#ffd789",
  fontSize: 11,
};

const detailStyle: CSSProperties = {
  display: "grid",
  gridColumn: "1 / -1",
  gap: 4,
  marginTop: 4,
  padding: "8px 10px",
  border: "1px solid rgba(150,169,231,0.22)",
  borderRadius: 4,
  background: "rgba(5,11,24,0.32)",
  color: "#cbd6eb",
  fontSize: 11,
  lineHeight: 1.4,
};

const emptyStyle: CSSProperties = {
  margin: 0,
  padding: "14px 10px 16px",
  color: "#aeb8df",
  textAlign: "center"
};

const visualRoleLabels: Record<NonNullable<AgentTeamMember["visualRole"]>, string> = {
  browser: "浏览角色",
  coder: "编码角色",
  files: "文件 / 质检角色",
  ops: "运维角色",
  lead: "队长角色",
};

const onlineRosterStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: 7,
  margin: "0 12px 14px",
  padding: "9px 11px",
  border: "1px solid rgba(103,232,165,0.2)",
  borderRadius: 5,
  background: "rgba(5,30,33,0.28)",
  color: "#b9e9d6",
  fontSize: 11,
};

const onlineMemberStyle: CSSProperties = {
  padding: "4px 7px",
  borderRadius: 999,
  background: "rgba(103,232,165,0.11)",
  color: "#d2ffe9",
  fontWeight: 700,
};

const manualOverrideStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 10,
  margin: "0 12px 14px",
  padding: "9px 11px",
  border: "1px solid rgba(248,189,88,0.25)",
  borderRadius: 5,
  background: "rgba(248,189,88,0.07)",
  color: "#ffe4a3",
  fontSize: 11,
};

export function AgentTeamPanel({
  agents,
  defaultExpanded,
  token,
  initialBinding,
  canBind = true,
  onlineMembers,
  onSelectAgent,
  onViewDetails
}: AgentTeamPanelProps) {
  const [expanded, setExpanded] = useState(defaultExpanded ?? true);
  const [selectedId, setSelectedId] = useState<string | null>(initialBinding?.roleKey ?? null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [manualOverrideOpen, setManualOverrideOpen] = useState(!token);

  async function selectAgent(agent: AgentTeamMember) {
    if (!canBind) return;
    const previousId = selectedId;
    setSelectedId(agent.id);
    setActionError(null);
    if (!token) {
      onSelectAgent?.(agent);
      return;
    }

    setSavingId(agent.id);
    try {
      await setAgentTeamBinding(agent.id, token);
      onSelectAgent?.(agent);
    } catch {
      setSelectedId(previousId);
      setActionError("身份绑定失败，请稍后重试。");
    } finally {
      setSavingId(null);
    }
  }

  async function clearBinding(agent: AgentTeamMember) {
    if (!token || selectedId !== agent.id || !canBind) return;
    setSavingId(agent.id);
    setActionError(null);
    try {
      await clearAgentTeamBinding(token);
      setSelectedId(null);
    } catch {
      setActionError("解除绑定失败，请稍后重试。");
    } finally {
      setSavingId(null);
    }
  }

  return (
    <section aria-label="Agent 战队" style={panelStyle}>
      <button
        type="button"
        aria-expanded={expanded}
        aria-label={`${expanded ? "收起" : "展开"} Agent 战队`}
        onClick={() => setExpanded((value) => !value)}
        style={headerStyle}
      >
        <span>
          <span style={eyebrowStyle}>AGENT PARTY // LIVE ROSTER</span>
          <h2 style={titleStyle}>Agent 战队</h2>
        </span>
        <span style={{ display: "flex", alignItems: "center" }}>
          <span style={summaryStyle}>{agents.length} 名成员</span>
          <span aria-hidden="true" style={chevronStyle}>
            {expanded ? "-" : "+"}
          </span>
        </span>
      </button>

      {expanded ? (
        <>
          {onlineMembers ? (
            <div aria-label="在线战队成员" style={onlineRosterStyle}>
              <strong>在线战队成员</strong>
              {onlineMembers.length === 0 ? <span>暂无已绑定在线成员</span> : null}
              {onlineMembers.map((member) => (
                <span key={member.studentId} style={onlineMemberStyle}>
                  {member.displayName} · {member.agentRole}
                </span>
              ))}
            </div>
          ) : null}
          {canBind && token ? (
            <div style={manualOverrideStyle}>
              <span>
                默认由本地 Agent 在接入时自主选择角色；这里仅用于人工接管。
              </span>
              <button
                type="button"
                aria-expanded={manualOverrideOpen}
                onClick={() => setManualOverrideOpen((value) => !value)}
                style={buttonStyle}
              >
                {manualOverrideOpen ? "收起人工接管" : "打开人工接管"}
              </button>
            </div>
          ) : null}
          <div style={rosterStyle}>
          {actionError ? <p role="alert" style={warningStyle}>{actionError}</p> : null}
          {agents.length === 0 ? (
            <p style={emptyStyle}>当前没有可用的 Agent</p>
          ) : (
            agents.map((agent) => {
              const selected = selectedId === agent.id;
              const statusColor = statusColors[agent.status];

              return (
                <article
                  key={agent.id}
                  aria-label={agent.name}
                  data-selected={selected}
                  style={{
                    ...cardStyle,
                    borderColor: selected ? "#f5d982" : cardStyle.borderColor,
                    boxShadow: selected
                      ? "0 4px 0 rgba(5,8,22,0.48), inset 0 0 0 1px rgba(246,200,95,0.16)"
                      : cardStyle.boxShadow
                  }}
                >
                  <span role="img" aria-label={`${agent.name} 角色图标`} style={iconStyle}>
                    {agent.icon}
                  </span>
                  <div>
                    <h3 style={nameStyle}>{agent.name}</h3>
                    {selected ? <span style={selectedBadgeStyle}>当前身份</span> : null}
                    <p style={responsibilityStyle}>{agent.responsibility}</p>
                    <div>
                      <span style={{ ...statusStyle, color: statusColor }}>
                        <span aria-hidden="true">●</span>
                        {agent.status}
                      </span>
                      <span style={taskStyle}>并发任务 {agent.concurrentTasks}</span>
                    </div>
                    <div aria-label="能力标签" style={capabilityListStyle}>
                      {agent.capabilities.map((capability) => (
                        <span key={capability} style={capabilityStyle}>
                          {capability}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div style={actionStyle}>
                    {manualOverrideOpen ? (
                      <button
                        type="button"
                        aria-pressed={selected}
                        disabled={!canBind || savingId === agent.id}
                        onClick={() => void selectAgent(agent)}
                        style={selected ? selectedButtonStyle : buttonStyle}
                      >
                        {!canBind ? "学生可绑定" : savingId === agent.id ? "保存中..." : selected ? "已选择" : "选择角色"}
                      </button>
                    ) : null}
                    {manualOverrideOpen && selected && token ? (
                      <button
                        type="button"
                        disabled={savingId === agent.id}
                        onClick={() => void clearBinding(agent)}
                        style={buttonStyle}
                      >
                        解除绑定
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => {
                        setDetailId((current) => current === agent.id ? null : agent.id);
                        onViewDetails?.(agent);
                      }}
                      style={buttonStyle}
                    >
                      {detailId === agent.id ? "收起详情" : "查看详情"}
                    </button>
                  </div>
                  {detailId === agent.id ? (
                    <div style={detailStyle}>
                      <span>像素角色：{agent.visualRole ? visualRoleLabels[agent.visualRole] : "待映射"}</span>
                      <span>当前阶段：仅绑定身份，不执行任务</span>
                    </div>
                  ) : null}
                </article>
              );
            })
          )}
          </div>
        </>
      ) : null}
    </section>
  );
}
