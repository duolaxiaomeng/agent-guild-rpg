import Link from "next/link";
import type { CSSProperties } from "react";
import { AgentTeamPanel, type AgentTeamMember } from "../../components/agent-team/agent-team-panel";
import { StudentAgentAssignments } from "../../components/agent-team/student-agent-assignments";
import { SessionBanner } from "../../components/auth/session-banner";
import { getAgentTeamBindingSafe, getAgentTeamCatalogSafe, getAgentTeamRosterSafe, getMyAgentAssignmentsSafe } from "../../lib/api-client";
import { getServerSession } from "../../lib/server-session";

export const dynamic = "force-dynamic";

const ROLE_ICONS: Record<string, string> = {
  ta: "TA",
  reviewer: "QA",
  mentor: "ME",
  qa: "TE",
  "philosophy-design-mentor": "PH",
  "software-architect": "SA",
  "deployment-release": "DR",
  "frontend-developer": "FE",
  "backend-developer": "BE",
  "operations-architect": "OP"
};

export default async function AgentTeamPage() {
  const result = await getServerSession();

  if (result.status !== "authenticated") {
    return (
      <main style={pageStyle} data-scrollable="true">
        <SessionBanner />
        <div style={containerStyle}>
          <h1 style={titleStyle}>全局 Agent 战队</h1>
          <p style={mutedStyle}>请先登录后查看 Agent 战队。</p>
          <Link href="/login" style={linkStyle}>前往登录 →</Link>
        </div>
      </main>
    );
  }

  const [
    { data: catalog, degraded: catalogDegraded },
    { data: bindingPayload, degraded: bindingDegraded },
    { data: onlineMembers, degraded: rosterDegraded },
    { data: assignedRuns, degraded: assignmentsDegraded },
  ] = await Promise.all([
    getAgentTeamCatalogSafe(result.session.token),
    getAgentTeamBindingSafe(result.session.token),
    getAgentTeamRosterSafe(result.session.token),
    result.session.user.role === "student"
      ? getMyAgentAssignmentsSafe(result.session.token)
      : Promise.resolve({ data: [], degraded: false }),
  ]);
  const binding = bindingPayload.binding;
  const agents: AgentTeamMember[] = catalog.roles.map((role) => ({
    id: role.roleKey,
    name: role.name,
    icon: ROLE_ICONS[role.roleKey] ?? "AI",
    responsibility: role.description,
    capabilities: role.capabilities,
    status: binding?.roleKey === role.roleKey ? "online" : "idle",
    concurrentTasks: 0,
    visualRole: role.visualRole,
  }));
  const degraded = catalogDegraded || bindingDegraded || rosterDegraded || assignmentsDegraded;

  return (
    <main style={pageStyle} data-scrollable="true">
      <SessionBanner />
      <div style={containerStyle}>
        <header style={heroStyle}>
          <div style={heroTopStyle}>
            <Link href="/" style={linkStyle}>← 返回主城区</Link>
            <span style={liveBadgeStyle}>{agents.length} 名角色已就绪</span>
          </div>
          <span style={eyebrowStyle}>AGENT GUILD / ROLE DIRECTORY</span>
          <h1 style={titleStyle}>全局 Agent 战队</h1>
          <p style={subtitleStyle}>本地 Agent 接入时自主选择角色；老师分配职责后，再并行完成同一个 Day 任务。</p>
          <div style={flowStyle} aria-label="Agent 协作流程">
            <FlowStep index="01" label="Agent 自主选角" />
            <span aria-hidden="true" style={flowArrowStyle}>→</span>
            <FlowStep index="02" label="分配职责" />
            <span aria-hidden="true" style={flowArrowStyle}>→</span>
            <FlowStep index="03" label="并行执行" />
          </div>
        </header>
        {degraded ? <p role="status" style={warningStyle}><span aria-hidden="true">!</span> Agent 战队服务暂不可达，当前显示空目录。</p> : null}
        <AgentTeamPanel
          agents={agents}
          defaultExpanded
          token={result.session.user.role === "student" ? result.session.token : undefined}
          initialBinding={binding}
          canBind={result.session.user.role === "student"}
          onlineMembers={onlineMembers}
        />
        {result.session.user.role === "student" ? (
          <StudentAgentAssignments
            initialRuns={assignedRuns}
            token={result.session.token}
          />
        ) : null}
      </div>
    </main>
  );
}

function FlowStep({ index, label }: { index: string; label: string }) {
  return (
    <span style={flowStepStyle}>
      <strong style={flowIndexStyle}>{index}</strong>
      {label}
    </span>
  );
}

const pageStyle: CSSProperties = {
  minHeight: "100vh",
  background: "linear-gradient(rgba(118,146,255,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(118,146,255,0.035) 1px, transparent 1px), radial-gradient(circle at 72% 0%, rgba(91,73,190,0.24), transparent 32rem), linear-gradient(145deg, #090f20 0%, #16213c 52%, #080e1b 100%)",
  backgroundSize: "32px 32px, 32px 32px, auto, auto",
  color: "#fff"
};

const containerStyle: CSSProperties = {
  width: "min(1160px, calc(100vw - 32px))",
  margin: "0 auto",
  padding: "clamp(24px, 4vw, 48px) 0 72px"
};

const titleStyle: CSSProperties = {
  margin: "5px 0 10px",
  fontFamily: "var(--font-pixel)",
  fontSize: "clamp(30px, 5vw, 44px)",
  fontWeight: 900,
  letterSpacing: "-0.045em",
  textShadow: "0 4px 0 rgba(0,0,0,0.38)"
};

const subtitleStyle: CSSProperties = {
  maxWidth: 660,
  margin: 0,
  color: "#b7c3dc",
  fontSize: 14,
  lineHeight: 1.7
};

const mutedStyle: CSSProperties = { color: "#aeb8df" };
const warningStyle: CSSProperties = { display: "flex", alignItems: "center", gap: 9, margin: "0 0 16px", padding: "11px 14px", border: "1px solid rgba(248,189,88,0.34)", borderRadius: 7, background: "rgba(248,189,88,0.08)", color: "#ffd789", fontSize: 13 };
const linkStyle: CSSProperties = { color: "#d7deff", textDecoration: "none", fontFamily: "var(--font-pixel)", fontSize: 11, fontWeight: 800, letterSpacing: "0.03em" };
const heroStyle: CSSProperties = { marginBottom: 22, padding: "clamp(22px, 4vw, 36px)", border: "1px solid rgba(150,178,221,0.24)", borderRadius: 12, background: "linear-gradient(135deg, rgba(34,45,84,0.92), rgba(13,23,47,0.95))", boxShadow: "0 6px 0 rgba(3,6,14,0.58), 0 24px 56px rgba(2,6,18,0.34)" };
const heroTopStyle: CSSProperties = { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 26 };
const liveBadgeStyle: CSSProperties = { padding: "5px 10px", border: "1px solid rgba(80,214,186,0.36)", borderRadius: 999, background: "rgba(80,214,186,0.1)", color: "#8ce7d5", fontSize: 11, fontWeight: 800 };
const eyebrowStyle: CSSProperties = { color: "#f6c85f", fontFamily: "var(--font-pixel)", fontSize: 10, fontWeight: 900, letterSpacing: "0.14em" };
const flowStyle: CSSProperties = { display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8, marginTop: 24 };
const flowStepStyle: CSSProperties = { display: "inline-flex", alignItems: "center", gap: 8, minHeight: 34, padding: "6px 10px", border: "1px solid rgba(150,178,221,0.2)", borderRadius: 5, background: "rgba(5,11,24,0.36)", color: "#cbd6eb", fontSize: 12, fontWeight: 700 };
const flowIndexStyle: CSSProperties = { color: "#9aafff", fontFamily: "var(--font-pixel)", fontSize: 10 };
const flowArrowStyle: CSSProperties = { color: "#65779b", fontFamily: "var(--font-pixel)", fontSize: 12 };
