"use client";

import { useState, type CSSProperties } from "react";

export type AgentTeamStatus = "online" | "idle" | "running";

export type AgentTeamMember = {
  id: string;
  name: string;
  icon: string;
  responsibility: string;
  capabilities: string[];
  status: AgentTeamStatus;
  concurrentTasks: number;
};

export type AgentTeamPanelProps = {
  agents: AgentTeamMember[];
  defaultExpanded?: boolean;
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

const emptyStyle: CSSProperties = {
  margin: 0,
  padding: "14px 10px 16px",
  color: "#aeb8df",
  textAlign: "center"
};

export function AgentTeamPanel({
  agents,
  defaultExpanded,
  onSelectAgent,
  onViewDetails
}: AgentTeamPanelProps) {
  const [expanded, setExpanded] = useState(defaultExpanded ?? true);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  function selectAgent(agent: AgentTeamMember) {
    setSelectedId(agent.id);
    onSelectAgent?.(agent);
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
        <div style={rosterStyle}>
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
                    <button
                      type="button"
                      aria-pressed={selected}
                      onClick={() => selectAgent(agent)}
                      style={selected ? selectedButtonStyle : buttonStyle}
                    >
                      {selected ? "已选择" : "选择角色"}
                    </button>
                    <button type="button" onClick={() => onViewDetails?.(agent)} style={buttonStyle}>
                      查看详情
                    </button>
                  </div>
                </article>
              );
            })
          )}
        </div>
      ) : null}
    </section>
  );
}
