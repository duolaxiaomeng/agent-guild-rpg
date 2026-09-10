import { DayPanel } from "../../components/quests/day-panel";
import { SessionBanner } from "../../components/auth/session-banner";
import { ReviewQueue } from "../../components/teacher/review-queue";
import { ClassInsightPanel } from "../../components/teacher/class-insight-panel";
import { ClassroomControlPanel } from "../../components/classroom/classroom-control-panel";
import { HelpQueue } from "../../components/classroom/help-queue";
import { WebsiteLotteryManager } from "../../components/website-lottery/website-lottery-manager";
import { TeacherTaskBoard } from "../../components/teacher/teacher-task-board";
import { AgentAssignmentBoard } from "../../components/teacher/agent-assignment-board";
import { AgentConnectorPanel } from "../../components/agent/agent-connector-panel";
import { CSSProperties } from "react";
import Link from "next/link";
import {
  getQuestListSafe,
  getReviewQueueSafe,
  getActiveClassroomSafe,
  getHelpRequestsSafe,
  getTeacherTaskProgressSafe,
  getAgentAssignmentsSafe,
  fetchAgentAvatarsSafeWithToken,
  type ReviewQueueItem
} from "../../lib/api-client";
import type { HelpRequest } from "contracts";
import { toDayLabel, toDayStatus, toRewardText, toTimeLabel } from "../../lib/format";
import { getServerSession } from "../../lib/server-session";

export const dynamic = "force-dynamic";

function toDecisionLabel(decision: Exclude<ReviewQueueItem["decision"], null>) {
  if (decision === "approve") {
    return "已通过";
  }

  if (decision === "adjust") {
    return "需要调整";
  }

  return "已退回";
}

function toReviewStatusLabel(item: ReviewQueueItem) {
  if (item.reviewStatus === "queued") {
    return "AI评审中";
  }

  if (item.reviewStatus === "ai_reviewed") {
    return "待老师裁定";
  }

  if (item.reviewStatus === "needs_teacher") {
    return "AI失败 · 请老师接管";
  }

  return toDecisionLabel(item.decision ?? "approve");
}

function toNextDayId(dayIds: string[]) {
  const maxDay = dayIds.reduce((currentMax, dayId) => {
    const match = /^day-(\d+)$/i.exec(dayId);
    return match ? Math.max(currentMax, Number(match[1])) : currentMax;
  }, 0);
  return `day-${maxDay + 1}`;
}

type TeacherPageProps = {
  searchParams?: Promise<{ reviewPage?: string | string[] }>;
};

export default async function TeacherPage({ searchParams }: TeacherPageProps) {
  const result = await getServerSession();

  if (result.status === "unauthenticated") {
    return (
      <main data-scrollable="true" style={pageMainStyle}>
        <SessionBanner />
        <div style={containerStyle}>
          <h1 style={titleStyle}>老师工作台</h1>
          <p style={{ color: "rgba(255,255,255,0.7)" }}>请先登录老师账号。</p>
          <Link href="/login" style={{ color: "#6366f1", textDecoration: "none", fontSize: "14px", marginTop: "12px", display: "inline-block" }}>
            前往登录 →
          </Link>
        </div>
      </main>
    );
  }

  if (result.status === "api-unreachable") {
    return (
      <main data-scrollable="true" style={pageMainStyle}>
        <SessionBanner />
        <div style={containerStyle}>
          <h1 style={titleStyle}>老师工作台</h1>
          <p style={{ color: "#fbbf24" }}>教学 API 暂不可达，请稍后刷新重试。</p>
        </div>
      </main>
    );
  }

  const session = result.session;
  const resolvedSearchParams = await searchParams;
  const reviewPageValue = resolvedSearchParams?.reviewPage;
  const reviewPage = Math.max(
    1,
    Number.parseInt(
      typeof reviewPageValue === "string" ? reviewPageValue : "1",
      10
    ) || 1
  );

  const classroomResult = await getActiveClassroomSafe(session.token);
  const classroom = classroomResult.data;
  const canEnterAsAssistant = !classroomResult.degraded && classroom.viewer.role === "assistant";

  if (session.user.role !== "teacher" && !canEnterAsAssistant) {
    return (
      <main data-scrollable="true" style={pageMainStyle}>
        <SessionBanner />
        <div style={containerStyle}>
          <h1 style={titleStyle}>老师工作台</h1>
          <p style={{ color: "rgba(255,255,255,0.5)" }}>当前账号无权进入老师工作台。</p>
        </div>
      </main>
    );
  }

  const [
    { data: quests, degraded: questsDegraded },
    { data: reviewQueue, degraded: reviewQueueDegraded },
    { avatars: students, degraded: studentsDegraded },
    helpResult,
    taskProgressResult,
    assignmentResult
  ] = await Promise.all([
    getQuestListSafe(session.token),
    getReviewQueueSafe(session.token, reviewPage, 50),
    fetchAgentAvatarsSafeWithToken(session.token),
    classroomResult.degraded || !classroom.session.id
      ? Promise.resolve({ data: [] as HelpRequest[], degraded: classroomResult.degraded })
      : getHelpRequestsSafe(classroom.session.id, session.token),
    session.user.role === "teacher"
      ? getTeacherTaskProgressSafe(session.token)
      : Promise.resolve({ data: [], degraded: false }),
    session.user.role === "teacher"
      ? getAgentAssignmentsSafe(session.token)
      : Promise.resolve({ data: [], degraded: false })
  ]);
  const classroomDegraded = classroomResult.degraded || helpResult.degraded;
  const currentQuest = quests.find((quest) => quest.status === "open") ?? quests[0];
  const courseWorldId = taskProgressResult.data[0]?.courseWorldId
    ?? currentQuest?.courseWorldId
    ?? classroom.session.courseWorldId
    ?? "";
  const defaultDayId = toNextDayId([
    ...taskProgressResult.data.map((task) => task.dayId),
    ...quests.map((quest) => quest.dayId ?? quest.id)
  ]);
  const assignmentStudents = Array.from(new Map([
    ...taskProgressResult.data.flatMap((task) => task.students).map((student) => [
      student.studentId,
      { id: student.studentId, displayName: student.displayName }
    ] as const),
    ...students.map((student) => [
      student.studentId,
      { id: student.studentId, displayName: student.displayName }
    ] as const)
  ]).values());

  const dayItems = quests.map((quest) => ({
    id: quest.id,
    label: toDayLabel(quest.id),
    title: quest.title,
    status: toDayStatus(quest.status),
    reward: toRewardText(quest.status)
  }));

  return (
    <main data-scrollable="true" style={pageMainStyle}>
      <SessionBanner />
      <div style={containerStyle}>
        <header style={heroStyle}>
          <div style={heroCopyStyle}>
            <span style={eyebrowStyle}>TEACHING COMMAND CENTER</span>
            <h1 style={titleStyle}>老师工作台</h1>
            <p style={heroDescriptionStyle}>
              集中查看课堂进度、学生求助与评审状态，把每一项教学行动推进到下一步。
            </p>
          </div>
          <Link href="/" style={primaryLinkStyle}>
            <span aria-hidden="true">←</span>
            进入我的主城区
          </Link>

          <div style={overviewGridStyle}>
            <OverviewCard
              label="当前关卡"
              value={currentQuest ? toDayLabel(currentQuest.id) : "待开放"}
              hint={currentQuest ? "进行中的课程关卡" : "暂无关卡数据"}
              tone="#64b7ff"
            />
            <OverviewCard
              label="课堂状态"
              value={classroom.session.status === "live" ? "进行中" : "待开始"}
              hint={classroom.currentStage?.title ?? "暂无活动阶段"}
              tone="#50d6ba"
            />
            <OverviewCard
              label="待处理评审"
              value={String(reviewQueue.summary.pendingCount)}
              hint="AI 队列与老师裁定"
              tone="#f8bd58"
            />
            <OverviewCard
              label="学生房间"
              value={String(students.length)}
              hint="可进入查看协作上下文"
              tone="#9aafff"
            />
          </div>
        </header>

        {/* Degraded notice */}
        {questsDegraded || reviewQueueDegraded || studentsDegraded || classroomDegraded || taskProgressResult.degraded || assignmentResult.degraded ? (
          <div
            role="status"
            style={warningNoticeStyle}
          >
            <span aria-hidden="true" style={noticeMarkerStyle}>!</span>
            {classroomDegraded
              ? "课堂数据暂不可达，当前显示安全空态。"
              : taskProgressResult.degraded
                ? "作业进度暂不可达，任务发布区当前显示安全空态。"
                : assignmentResult.degraded
                  ? "Agent 任务控制面暂不可达，当前显示安全空态。"
                : "评审与关卡数据暂不可达，当前显示安全空态。"}
          </div>
        ) : null}

        {session.user.role === "teacher" ? (
          <TeacherTaskBoard
            initialTasks={taskProgressResult.data}
            courseWorldId={courseWorldId}
            defaultDayId={defaultDayId}
            token={session.token}
          />
        ) : null}

        {session.user.role === "teacher" ? (
          <AgentAssignmentBoard
            initialRuns={assignmentResult.data}
            students={assignmentStudents}
            courseWorldId={courseWorldId}
            defaultDayId={currentQuest?.dayId ?? currentQuest?.id ?? defaultDayId}
            token={session.token}
          />
        ) : null}

        {session.user.role === "teacher" ? (
          <AgentConnectorPanel
            dayId={currentQuest?.dayId ?? currentQuest?.id ?? defaultDayId}
            variant="embedded"
            title="老师 Agent"
          />
        ) : null}

        {/* Day Panel */}
        <DayPanel currentDayId={currentQuest?.id ?? ""} days={dayItems} />

        {session.user.role === "teacher" ? (
          <WebsiteLotteryManager
            dayId={currentQuest?.dayId ?? currentQuest?.id ?? "day-1"}
            days={dayItems}
          />
        ) : null}

        {classroom.viewer.canControlStages ? (
          <ClassroomControlPanel snapshot={classroom} token={session.token} />
        ) : null}

        {classroom.viewer.canHandleHelp ? (
          <HelpQueue
            sessionId={classroom.session.id}
            requests={helpResult.data}
            token={session.token}
            canHandleHelp={classroom.viewer.canHandleHelp}
          />
        ) : null}

        {/* Class Insight */}
        <ClassInsightPanel />

        {/* Review Queue */}
        <ReviewQueue
          summary={reviewQueue.summary}
          pagination={reviewQueue.pagination}
          items={reviewQueue.items.map((item) => ({
            submissionId: item.submissionId,
            studentName: item.studentName,
            guildName: item.guildName,
            dayLabel: item.dayLabel,
            decisionLabel: toReviewStatusLabel(item),
            reviewStatus: item.reviewStatus,
            isPendingTeacherDecision: item.isPendingTeacherDecision,
            finalScore: item.finalScore,
            suggestedScore: item.suggestedScore,
            decision: item.decision,
            submittedAtLabel: toTimeLabel(item.submittedAt),
            rationale: item.rationale
          }))}
        />

        {/* Student Rooms */}
        <section style={roomSectionStyle}>
          <div style={sectionHeadingRowStyle}>
            <div>
              <span style={sectionEyebrowStyle}>COLLABORATION ROOMS</span>
              <h2 style={sectionTitleStyle}>学生房间</h2>
            </div>
            <span style={countBadgeStyle}>{students.length} 间</span>
          </div>
          <div style={roomGridStyle}>
            {students.length === 0 ? (
              <p style={emptyRoomStyle}>暂无学生数据。</p>
            ) : students.map((student) => (
              <Link
                key={student.studentId}
                href={`/chat?roomId=room-chat-${student.studentId}`}
                style={roomLinkStyle}
              >
                <span style={studentAvatarStyle} aria-hidden="true">
                  {student.displayName.slice(0, 1).toUpperCase()}
                </span>
                <span style={{ minWidth: 0 }}>
                  <strong style={studentNameStyle}>{student.displayName}</strong>
                  <span style={roomHintStyle}>进入聊天室查看协作上下文</span>
                </span>
                <span aria-hidden="true" style={roomArrowStyle}>→</span>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}

/* ─── Shared styles ─── */

const pageMainStyle: CSSProperties = {
  background: "radial-gradient(circle at 84% 4%, rgba(118,146,255,0.2), transparent 28rem), linear-gradient(145deg, #0a1020 0%, #111c35 48%, #07111e 100%)",
  minHeight: "100vh",
};

const containerStyle: CSSProperties = {
  width: "min(1120px, calc(100vw - 32px))",
  margin: "0 auto",
  padding: "clamp(24px, 4vw, 48px) 0 72px",
};

const titleStyle: CSSProperties = {
  fontFamily: "var(--font-pixel)",
  fontSize: "clamp(28px, 5vw, 42px)",
  fontWeight: "900",
  color: "#fff",
  margin: "4px 0 10px",
  letterSpacing: "-0.045em",
  textShadow: "0 4px 0 rgba(0,0,0,0.34)",
};

function OverviewCard({ label, value, hint, tone }: { label: string; value: string; hint: string; tone: string }) {
  return (
    <div style={{ ...overviewCardStyle, borderTopColor: tone }}>
      <span style={overviewLabelStyle}>{label}</span>
      <strong style={{ ...overviewValueStyle, color: tone }}>{value}</strong>
      <span style={overviewHintStyle}>{hint}</span>
    </div>
  );
}

const heroStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) auto",
  gap: "20px",
  alignItems: "start",
  marginBottom: "24px",
  padding: "clamp(22px, 4vw, 34px)",
  border: "1px solid rgba(150,178,221,0.24)",
  borderRadius: "12px",
  background: "linear-gradient(135deg, rgba(31,49,88,0.92), rgba(13,24,48,0.94))",
  boxShadow: "0 6px 0 rgba(3,6,14,0.56), 0 24px 60px rgba(2,6,18,0.34)",
};

const heroCopyStyle: CSSProperties = { minWidth: 0 };
const eyebrowStyle: CSSProperties = { color: "#50d6ba", fontFamily: "var(--font-pixel)", fontSize: 11, fontWeight: 800, letterSpacing: "0.14em" };
const heroDescriptionStyle: CSSProperties = { maxWidth: 650, margin: 0, color: "#aebbd3", fontSize: 14, lineHeight: 1.7 };
const primaryLinkStyle: CSSProperties = { display: "inline-flex", alignItems: "center", gap: 8, minHeight: 40, padding: "9px 14px", border: "1px solid rgba(154,175,255,0.48)", borderRadius: 6, background: "rgba(118,146,255,0.16)", boxShadow: "0 3px 0 rgba(3,6,14,0.45)", color: "#e8edff", textDecoration: "none", fontFamily: "var(--font-pixel)", fontSize: 12, fontWeight: 800, whiteSpace: "nowrap" };
const overviewGridStyle: CSSProperties = { gridColumn: "1 / -1", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(155px, 1fr))", gap: 10 };
const overviewCardStyle: CSSProperties = { display: "grid", gap: 5, minHeight: 108, padding: "14px 15px", border: "1px solid rgba(150,178,221,0.18)", borderTop: "3px solid", borderRadius: 6, background: "rgba(5,11,24,0.46)", boxShadow: "inset 0 1px rgba(255,255,255,0.03)" };
const overviewLabelStyle: CSSProperties = { color: "#8798b8", fontFamily: "var(--font-pixel)", fontSize: 10, fontWeight: 800, letterSpacing: "0.08em" };
const overviewValueStyle: CSSProperties = { fontSize: 22, lineHeight: 1.1 };
const overviewHintStyle: CSSProperties = { alignSelf: "end", color: "#aebbd3", fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" };
const warningNoticeStyle: CSSProperties = { display: "flex", alignItems: "center", gap: 10, marginBottom: 20, padding: "12px 16px", border: "1px solid rgba(248,189,88,0.34)", borderRadius: 8, background: "rgba(248,189,88,0.08)", color: "#ffd789", fontSize: 13 };
const noticeMarkerStyle: CSSProperties = { display: "grid", width: 22, height: 22, flex: "0 0 22px", placeItems: "center", border: "1px solid rgba(248,189,88,0.54)", borderRadius: 4, fontFamily: "var(--font-pixel)", fontWeight: 900 };
const roomSectionStyle: CSSProperties = { marginTop: 24, padding: "clamp(18px, 3vw, 24px)", border: "1px solid rgba(150,178,221,0.18)", borderRadius: 12, background: "rgba(13,24,46,0.72)", boxShadow: "0 5px 0 rgba(3,6,14,0.42)" };
const sectionHeadingRowStyle: CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, marginBottom: 16 };
const sectionEyebrowStyle: CSSProperties = { color: "#8998b5", fontFamily: "var(--font-pixel)", fontSize: 9, fontWeight: 800, letterSpacing: "0.12em" };
const sectionTitleStyle: CSSProperties = { margin: "2px 0 0", color: "#fff", fontFamily: "var(--font-pixel)", fontSize: 20 };
const countBadgeStyle: CSSProperties = { padding: "4px 9px", border: "1px solid rgba(118,146,255,0.35)", borderRadius: 999, background: "rgba(118,146,255,0.1)", color: "#cdd7ff", fontSize: 11, fontWeight: 800 };
const roomGridStyle: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 10 };
const roomLinkStyle: CSSProperties = { display: "grid", gridTemplateColumns: "40px minmax(0, 1fr) auto", alignItems: "center", gap: 12, minHeight: 70, padding: "12px 14px", border: "1px solid rgba(150,178,221,0.18)", borderRadius: 7, background: "linear-gradient(135deg, rgba(29,46,80,0.72), rgba(13,24,46,0.72))", boxShadow: "0 3px 0 rgba(3,6,14,0.38)", color: "#dce5f8", textDecoration: "none", fontSize: 13 };
const studentAvatarStyle: CSSProperties = { display: "grid", width: 40, height: 40, placeItems: "center", border: "2px solid rgba(246,200,95,0.7)", borderRadius: 5, background: "#33466f", color: "#fff3c7", fontFamily: "var(--font-pixel)", fontSize: 14, fontWeight: 900, boxShadow: "inset 0 -4px rgba(3,6,14,0.24)" };
const studentNameStyle: CSSProperties = { display: "block", overflow: "hidden", color: "#f7f9ff", fontSize: 14, textOverflow: "ellipsis", whiteSpace: "nowrap" };
const roomHintStyle: CSSProperties = { display: "block", marginTop: 2, overflow: "hidden", color: "#8998b5", fontSize: 11, textOverflow: "ellipsis", whiteSpace: "nowrap" };
const roomArrowStyle: CSSProperties = { color: "#9aafff", fontFamily: "var(--font-pixel)", fontSize: 16 };
const emptyRoomStyle: CSSProperties = { gridColumn: "1 / -1", margin: 0, padding: 20, border: "1px dashed rgba(150,178,221,0.22)", borderRadius: 7, color: "#8998b5", fontSize: 13, textAlign: "center" };
