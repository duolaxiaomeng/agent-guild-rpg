import { getQuestListSafe, getWorldPayloadSafe } from "../lib/api-client";
import { getServerSession } from "../lib/server-session";
import { SessionBanner } from "../components/auth/session-banner";
import { WorldShell } from "../components/world/world-shell";
import { InsightPanel } from "../components/world/insight-panel";
import { AgentConnectorPanel } from "../components/agent/agent-connector-panel";
import { StudentClassroomBanner } from "../components/classroom/student-classroom-banner";
import { WebsiteLotteryPanel } from "../components/website-lottery/website-lottery-panel";
import { getActiveClassroomSafe } from "../lib/api-client";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const result = await getServerSession();
  const token = result.status === "authenticated" ? result.session.token : undefined;
  const [{ data, degraded }, questsResult] = await Promise.all([
    getWorldPayloadSafe(token),
    getQuestListSafe(token),
  ]);
  const quests = questsResult.data;
  const onlineHomesteadCount = data.homesteads.filter((homestead) => homestead.isOnline).length;
  const completedQuestCount = quests.filter((quest) => quest.status === "completed").length;
  const activeQuest = quests.find((quest) => quest.status === "open");
  const classroomResult = result.status === "authenticated" && result.session.user.role === "student"
    ? await getActiveClassroomSafe(result.session.token)
    : null;

  return (
    <main style={{ overflow: "hidden", background: "#070d1c" }}>
      <SessionBanner />
      <div style={{ position: "relative", flex: 1, minHeight: 0, overflow: "hidden" }}>
        <WorldShell />
        <header className="guild-topbar">
          <div className="guild-mark" aria-hidden="true">AG</div>
          <div>
            <p className="guild-kicker">AGENT GUILD / WORLD OS</p>
            <p className="guild-title">星港学习世界</p>
          </div>
          <span className="guild-live-pill"><span aria-hidden="true" /> LIVE · 学期 01</span>
          <nav className="guild-main-nav" aria-label="主导航">
            <a href="/guilds">工会</a>
            <a href="/agent-team">Agent 战队</a>
            <a href="/teacher">老师工作台</a>
          </nav>
        </header>
        <aside className="mission-rail" aria-label="今日任务概览">
          <div className="mission-rail__head">
            <div>
              <p className="mission-rail__eyebrow">TODAY'S RUN</p>
              <h2>第 {Math.max(data.currentDay, 1)} 天行动</h2>
            </div>
            <span className="mission-rail__level">LV.{Math.max(data.currentDay, 1)}</span>
          </div>
          <div className="mission-rail__stats">
            <div><b>{onlineHomesteadCount}</b><span>在线成员</span></div>
            <div><b>{completedQuestCount}</b><span>已完成</span></div>
            <div><b>{quests.length}</b><span>总任务</span></div>
          </div>
          {activeQuest ? (
            <div className="mission-card mission-card--active">
              <span className="mission-card__status">● 当前任务</span>
              <strong>{activeQuest.title}</strong>
              <p>{activeQuest.description ?? "完成今日挑战，解锁下一块世界区域。"}</p>
            </div>
          ) : (
            <div className="mission-card mission-card--empty">
              <span className="mission-card__status">○ 等待同步</span>
              <strong>任务日志暂未加载</strong>
              <p>进入课程或稍后刷新，继续你的 Agent 训练。</p>
            </div>
          )}
          <div className="mission-rail__links">
            <a href="/chat">打开世界频道 <span>↗</span></a>
            <a href="/guilds">查看工会排行 <span>↗</span></a>
          </div>
        </aside>
        <section
          aria-label="主城区概览"
          className="student-world-brand"
          style={{
            position: "absolute",
            top: "50px",
            right: "16px",
            zIndex: 20,
            display: "flex",
            alignItems: "center",
            gap: "12px",
            maxWidth: "calc(100vw - 32px)",
            padding: "7px 11px",
            color: "#fff",
            background: "linear-gradient(180deg, rgba(10,18,38,.92), rgba(5,10,24,.88))",
            border: "1px solid rgba(125,211,252,.42)",
            borderRadius: "5px",
            boxShadow: "0 4px 0 rgba(2,6,23,.72), inset 0 1px 0 rgba(255,255,255,.08)",
            backdropFilter: "blur(8px)",
          }}
        >
          <span
            aria-hidden="true"
            style={{
              width: 8,
              height: 8,
              background: degraded ? "#fbbf24" : "#4ade80",
              boxShadow: `0 0 10px ${degraded ? "#fbbf24" : "#4ade80"}`,
              flex: "0 0 auto",
            }}
          />
          <div>
            <span style={{ display: "block", color: "#7dd3fc", fontSize: 9, fontWeight: 800, letterSpacing: "0.18em" }}>
              AGENT GUILD / LIVE WORLD
            </span>
            <h1
              style={{
                color: "#fff",
                textShadow: "2px 2px 0 rgba(0,0,0,.55)",
                fontSize: "18px",
                lineHeight: 1.25,
                margin: 0,
                letterSpacing: "0.02em",
              }}
            >
              主城区{data.currentDay > 0 ? ` · 第 ${data.currentDay} 天` : ""}
            </h1>
          </div>
          <span
            className="student-world-online"
            style={{
              marginLeft: 4,
              paddingLeft: 12,
              borderLeft: "1px solid rgba(148,163,184,.25)",
              color: "#cbd5e1",
              fontSize: 11,
              whiteSpace: "nowrap",
            }}
          >
            在线家园 <b style={{ color: "#86efac" }}>{onlineHomesteadCount}</b> / {data.homesteads.length}
          </span>
        </section>
        {degraded || result.status === "api-unreachable" ? (
          <p
            role="status"
            style={{
              position: "absolute",
              bottom: "78px",
              left: "16px",
              zIndex: 20,
              maxWidth: "min(440px, calc(100vw - 32px))",
              margin: 0,
              padding: "9px 12px",
              color: "#fecaca",
              background: "rgba(69,10,10,.88)",
              border: "1px solid rgba(248,113,113,.5)",
              borderRadius: 5,
              boxShadow: "0 4px 0 rgba(20,4,4,.65)",
              fontSize: 12,
            }}
          >
            实时教学 API 暂不可达，主城区已降级为空态展示。
          </p>
        ) : null}
        {result.status === "authenticated" && result.session.user.role === "student" && classroomResult && !classroomResult.degraded ? (
          <div
            className="student-classroom-dock"
            style={{ position: "absolute", left: 0, right: 0, bottom: 72, zIndex: 19, pointerEvents: "none" }}
          >
            <div style={{ pointerEvents: "auto" }}>
              <StudentClassroomBanner
                snapshot={classroomResult.data}
                token={result.session.token}
                studentId={result.session.user.id}
              />
            </div>
          </div>
        ) : null}
        {result.status === "authenticated" && result.session.user.role === "student" ? (
          <>
            <AgentConnectorPanel dayId={`day-${Math.max(data.currentDay, 1)}`} />
            <WebsiteLotteryPanel dayId={`day-${Math.max(data.currentDay, 1)}`} />
          </>
        ) : null}
        <InsightPanel />
      </div>
      <style>{`
        @media (max-width: 720px) {
          .student-world-brand { top: 52px !important; right: 8px !important; }
          .student-world-online { display: none !important; }
          .student-classroom-dock { bottom: 68px !important; }
        }
      `}</style>
    </main>
  );
}
