import { DayPanel } from "../../components/quests/day-panel";
import { SessionBanner } from "../../components/auth/session-banner";
import { ReviewQueue } from "../../components/teacher/review-queue";
import { ClassInsightPanel } from "../../components/teacher/class-insight-panel";
import { ClassroomControlPanel } from "../../components/classroom/classroom-control-panel";
import { HelpQueue } from "../../components/classroom/help-queue";
import { CSSProperties } from "react";
import Link from "next/link";
import {
  getQuestListSafe,
  getReviewQueueSafe,
  getActiveClassroomSafe,
  getHelpRequestsSafe,
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

  return toDecisionLabel(item.decision ?? "approve");
}

export default async function TeacherPage() {
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
    helpResult
  ] = await Promise.all([
    getQuestListSafe(session.token),
    getReviewQueueSafe(session.token),
    fetchAgentAvatarsSafeWithToken(session.token),
    classroomResult.degraded || !classroom.session.id
      ? Promise.resolve({ data: [] as HelpRequest[], degraded: classroomResult.degraded })
      : getHelpRequestsSafe(classroom.session.id, session.token)
  ]);
  const classroomDegraded = classroomResult.degraded || helpResult.degraded;
  const currentQuest = quests.find((quest) => quest.status === "open") ?? quests[0];

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
        {/* Header */}
        <div style={{ marginBottom: "28px" }}>
          <h1 style={titleStyle}>老师工作台</h1>
          <Link
            href="/"
            style={{
              fontSize: "13px",
              color: "rgba(255,255,255,0.4)",
              textDecoration: "none",
            }}
          >
            ← 返回主页
          </Link>
        </div>

        {/* Degraded notice */}
        {questsDegraded || reviewQueueDegraded || studentsDegraded || classroomDegraded ? (
          <div
            style={{
              background: "rgba(251,191,36,0.08)",
              border: "1px solid rgba(251,191,36,0.25)",
              borderRadius: "10px",
              padding: "12px 16px",
              marginBottom: "20px",
              fontSize: "13px",
              color: "#fbbf24",
            }}
          >
            {classroomDegraded ? "课堂数据暂不可达，当前显示安全空态。" : "评审与关卡数据暂不可达，当前显示安全空态。"}
          </div>
        ) : null}

        {/* Day Panel */}
        <DayPanel currentDayId={currentQuest?.id ?? ""} days={dayItems} />

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
          items={reviewQueue.items.map((item) => ({
            submissionId: item.submissionId,
            studentName: item.studentName,
            guildName: item.guildName,
            dayLabel: item.dayLabel,
            decisionLabel: toReviewStatusLabel(item),
            isPendingTeacherDecision: item.isPendingTeacherDecision,
            finalScore: item.finalScore,
            suggestedScore: item.suggestedScore,
            decision: item.decision,
            submittedAtLabel: toTimeLabel(item.submittedAt),
            rationale: item.rationale
          }))}
        />

        {/* Student Rooms */}
        <section style={{ marginTop: "24px" }}>
          <h2
            style={{
              margin: "0 0 16px",
              fontSize: "20px",
              fontWeight: "700",
              color: "#fff",
              letterSpacing: "-0.01em",
            }}
          >
            学生房间
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {students.length === 0 ? (
              <p style={{ color: "rgba(255,255,255,0.4)", fontSize: "14px" }}>暂无学生数据。</p>
            ) : students.map((student) => (
              <Link
                key={student.studentId}
                href={`/chat?roomId=room-chat-${student.studentId}`}
                style={{
                  display: "block",
                  padding: "14px 20px",
                  background: "rgba(255,255,255,0.05)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: "10px",
                  color: "rgba(255,255,255,0.75)",
                  textDecoration: "none",
                  fontSize: "14px",
                  transition: "background 0.15s",
                }}
              >
                查看 {student.displayName} 的聊天室 →
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
  background: "linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)",
  minHeight: "100vh",
};

const containerStyle: CSSProperties = {
  maxWidth: "960px",
  margin: "0 auto",
  padding: "32px 24px 64px",
};

const titleStyle: CSSProperties = {
  fontSize: "28px",
  fontWeight: "700",
  color: "#fff",
  margin: "0 0 6px",
  letterSpacing: "-0.02em",
};
