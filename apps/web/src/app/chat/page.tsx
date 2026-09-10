import { CSSProperties } from "react";
import Link from "next/link";
import { SessionBanner } from "../../components/auth/session-banner";
import { ChatRoom } from "../../components/chat/chat-room";
import { StudentClassroomBanner } from "../../components/classroom/student-classroom-banner";
import { DayPanel } from "../../components/quests/day-panel";
import {
  getChatRoomSafe,
  getActiveClassroomSafe,
  getMyAccessibleRoomsSafe,
  getQuestListSafe,
  getRoomAccessGrantsSafe,
  type AccessibleRoom,
  type ChatRoomPayload,
  type RoomAccessGrant,
} from "../../lib/api-client";
import { toDayLabel, toDayStatus, toRewardText, toTimeLabel } from "../../lib/format";
import { getServerSession } from "../../lib/server-session";

export const dynamic = "force-dynamic";

/* ────────────────────────────────────────────
   Styles
   ──────────────────────────────────────────── */

const pageStyle: CSSProperties = {
  minHeight: "100vh",
  background:
    "linear-gradient(rgba(56,189,248,.035) 1px, transparent 1px), linear-gradient(90deg, rgba(56,189,248,.035) 1px, transparent 1px), radial-gradient(circle at 82% 8%, rgba(14,165,233,.14), transparent 28%), linear-gradient(145deg, #07101f 0%, #10172e 52%, #071525 100%)",
  backgroundSize: "28px 28px, 28px 28px, auto, auto",
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  color: "#e2e8f0",
};

const containerStyle: CSSProperties = {
  maxWidth: "1080px",
  margin: "0 auto",
  padding: "30px 24px 72px",
};

const pageTitleStyle: CSSProperties = {
  fontSize: "clamp(26px, 5vw, 38px)",
  fontWeight: "800",
  color: "#fff",
  margin: "8px 0",
  letterSpacing: "-0.035em",
  textShadow: "3px 3px 0 rgba(2,6,23,.72)",
};

const pageSubtitleStyle: CSSProperties = {
  fontSize: "14px",
  color: "#94a3b8",
  margin: "0 0 24px",
  lineHeight: 1.7,
};

const degradedBannerStyle: CSSProperties = {
  background: "rgba(69, 10, 10, 0.5)",
  border: "1px solid rgba(248, 113, 113, 0.42)",
  borderRadius: "5px",
  padding: "12px 16px",
  marginBottom: "24px",
  color: "#fecaca",
  fontSize: "14px",
  boxShadow: "0 4px 0 rgba(28,5,5,.42)",
};

const accessibleSectionStyle: CSSProperties = {
  marginTop: "24px",
  background: "linear-gradient(145deg, rgba(17,34,61,.9), rgba(8,17,35,.92))",
  border: "1px solid rgba(125,211,252,.22)",
  borderRadius: "7px",
  padding: "22px 24px",
  boxShadow: "0 6px 0 rgba(2,6,23,.46)",
};

const accessibleSectionTitleStyle: CSSProperties = {
  fontSize: "16px",
  fontWeight: "800",
  color: "#fff",
  margin: "0 0 16px",
};

const accessibleRoomLinkStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  minHeight: 42,
  padding: "10px 13px",
  background: "rgba(8,47,73,.34)",
  border: "1px solid rgba(125,211,252,.25)",
  borderRadius: "4px",
  color: "#bae6fd",
  fontSize: "14px",
  textDecoration: "none",
  boxShadow: "0 3px 0 rgba(2,6,23,.36)",
  transition: "background 120ms ease, transform 120ms ease, border-color 120ms ease",
};

const emptyStateStyle: CSSProperties = {
  color: "#94a3b8",
  fontSize: "14px",
};

const entryCardStyle: CSSProperties = {
  position: "relative",
  overflow: "hidden",
  padding: "26px clamp(20px, 5vw, 40px)",
  background: "linear-gradient(145deg, rgba(16,34,62,.94), rgba(12,18,42,.94))",
  border: "1px solid rgba(125,211,252,.26)",
  borderRadius: 7,
  boxShadow: "0 7px 0 rgba(2,6,23,.52), 0 24px 54px rgba(2,6,23,.26)",
};

const backLinkStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 7,
  marginBottom: 18,
  padding: "7px 10px",
  color: "#bae6fd",
  background: "rgba(8,47,73,.32)",
  border: "1px solid rgba(125,211,252,.24)",
  borderRadius: 4,
  boxShadow: "0 3px 0 rgba(2,6,23,.4)",
  textDecoration: "none",
  fontSize: 12,
};

/* ────────────────────────────────────────────
   Helpers
   ──────────────────────────────────────────── */

function toSessionStatusLabel(status: ChatRoomPayload["sessionStatus"]) {
  if (status === "active") {
    return "进行中";
  }

  if (status === "completed") {
    return "已完成";
  }

  return "异常结束";
}

function toSubmissionMeta(
  latestSubmission: ChatRoomPayload["latestSubmission"]
) {
  if (!latestSubmission) {
    return undefined;
  }

  return `${latestSubmission.dayLabel} · ${toTimeLabel(latestSubmission.submittedAt)}`;
}

function toRoomId(studentId: string) {
  return `room-chat-${studentId}`;
}

type ChatPageProps = {
  searchParams?: Promise<{
    roomId?: string | string[];
  }>;
};

export default async function ChatPage({ searchParams }: ChatPageProps) {
  const result = await getServerSession();

  if (result.status === "unauthenticated") {
    return (
      <main style={pageStyle} data-scrollable="true">
        <div style={containerStyle}>
          <SessionBanner />
          <div style={{ ...entryCardStyle, marginTop: 26 }}>
            <span style={{ color: "#7dd3fc", fontSize: 10, fontWeight: 800, letterSpacing: ".18em" }}>ROOM NETWORK / LOGIN REQUIRED</span>
            <h1 style={pageTitleStyle}>个人聊天室</h1>
            <p style={emptyStateStyle}>请先登录学生账号。</p>
            <Link href="/login" style={{ ...backLinkStyle, margin: "18px 0 0" }}>前往登录 →</Link>
          </div>
        </div>
      </main>
    );
  }

  if (result.status === "api-unreachable") {
    return (
      <main style={pageStyle} data-scrollable="true">
        <div style={containerStyle}>
          <SessionBanner />
          <div style={{ ...entryCardStyle, marginTop: 26 }}>
            <span style={{ color: "#fbbf24", fontSize: 10, fontWeight: 800, letterSpacing: ".18em" }}>ROOM NETWORK / OFFLINE</span>
            <h1 style={pageTitleStyle}>个人聊天室</h1>
            <p style={{ color: "#fde68a" }}>教学 API 暂不可达，请稍后刷新重试。</p>
          </div>
        </div>
      </main>
    );
  }

  const session = result.session;

  if (session.user.role !== "student" && session.user.role !== "teacher") {
    return (
      <main style={pageStyle} data-scrollable="true">
        <div style={containerStyle}>
          <SessionBanner />
          <div style={{ ...entryCardStyle, marginTop: 26 }}>
            <h1 style={pageTitleStyle}>个人聊天室</h1>
            <p style={emptyStateStyle}>当前账号无权进入个人聊天室。</p>
          </div>
        </div>
      </main>
    );
  }

  const isTeacher = session.user.role === "teacher";

  const resolvedSearchParams = await searchParams;
  const requestedRoomId = resolvedSearchParams?.roomId;
  const requestedRoomIdString =
    typeof requestedRoomId === "string" ? requestedRoomId : undefined;

  if (isTeacher && !requestedRoomIdString) {
    return (
      <main style={pageStyle} data-scrollable="true">
        <div style={containerStyle}>
          <SessionBanner />
          <div style={{ ...entryCardStyle, marginTop: 26 }}>
            <h1 style={pageTitleStyle}>Teacher 观察</h1>
            <p style={emptyStateStyle}>请从教师工作台选择学生房间。</p>
            <Link href="/teacher" style={{ ...backLinkStyle, margin: "18px 0 0" }}>返回教师工作台 →</Link>
          </div>
        </div>
      </main>
    );
  }

  const roomId = requestedRoomIdString ?? toRoomId(session.user.id);
  const [{ data: chatRoom, degraded: chatDegraded }, { data: quests, degraded: questsDegraded }] =
    await Promise.all([getChatRoomSafe(roomId, session.token), getQuestListSafe(session.token)]);
  // F-017: In degraded mode, default to 'guest' instead of 'owner'.
  const effectiveViewerRole = isTeacher
    ? "teacher"
    : chatDegraded
      ? "guest"
      : chatRoom.viewerRole;
  // F-027: Parallelize the two independent API calls.
  const isOwner = effectiveViewerRole === "owner";
  let accessGrants: RoomAccessGrant[] = [];
  let accessibleRooms: AccessibleRoom[] = [];
  let grantsDegraded = false;
  let accessibleDegraded = false;

  if (isOwner) {
    const [grantsResult, accessibleResult] = await Promise.all([
      getRoomAccessGrantsSafe(roomId, session.token),
      getMyAccessibleRoomsSafe(session.token),
    ]);
    accessGrants = grantsResult.data;
    grantsDegraded = grantsResult.degraded;
    accessibleRooms = accessibleResult.data;
    accessibleDegraded = accessibleResult.degraded;
  }
  const currentQuest = quests.find((quest) => quest.status === "open") ?? quests[0];
  const classroomResult = !isTeacher
    ? await getActiveClassroomSafe(session.token)
    : { data: null, degraded: false };
  const dayItems = quests.map((quest) => ({
    id: quest.id,
    label: toDayLabel(quest.id),
    title: quest.title,
    status: toDayStatus(quest.status),
    reward: toRewardText(quest.status)
  }));

  return (
    <main style={pageStyle} data-scrollable="true">
      <div style={containerStyle}>
        <SessionBanner />
        <nav aria-label="聊天室路径" style={{ marginTop: 24 }}>
          <Link href="/" style={backLinkStyle}>← 返回主城区</Link>
        </nav>
        {chatDegraded || questsDegraded || grantsDegraded || accessibleDegraded ? (
          <div style={degradedBannerStyle}>聊天、授权与关卡数据暂不可达，当前显示安全空态。</div>
        ) : null}
        {!isTeacher && classroomResult.data ? (
          <StudentClassroomBanner
            snapshot={classroomResult.data}
            token={session.token}
            studentId={chatRoom.studentId}
          />
        ) : null}
        <ChatRoom
          key={`${chatRoom.roomId}-${effectiveViewerRole}-${accessGrants.length}-${
            chatRoom.latestSubmission?.id ?? "no-submission"
          }`}
          studentName={chatRoom.studentName}
          viewerRole={effectiveViewerRole}
          studentId={chatRoom.studentId}
          roomId={chatRoom.roomId}
          courseWorldId={currentQuest?.courseWorldId ?? null}
          dayId={currentQuest?.id ?? null}
          agentSessionId={chatRoom.agentSessionId}
          canSubmit={
            !chatDegraded &&
            !questsDegraded &&
            effectiveViewerRole === "owner" &&
            chatRoom.canSubmit &&
            Boolean(currentQuest?.courseWorldId && currentQuest.id)
          }
          agentLabel={chatRoom.agentLabel}
          sessionStatusLabel={toSessionStatusLabel(chatRoom.sessionStatus)}
          sessionSummary={chatRoom.sessionSummary}
          latestSubmissionStatus={
            chatRoom.latestSubmission?.statusLabel ?? "今日未提交"
          }
          latestSubmissionMeta={toSubmissionMeta(chatRoom.latestSubmission)}
          accessGrants={accessGrants}
          collaborationGuests={chatRoom.collaborationGuests.map((guest) => ({
            studentName: guest.studentName,
            contributionLabel: guest.contributionLabel
          }))}
          messages={chatRoom.messages}
        />
        <div style={{ marginTop: "24px" }}>
          <DayPanel currentDayId={currentQuest?.id ?? ""} days={dayItems} />
        </div>
        {effectiveViewerRole === "owner" && accessibleRooms.length > 0 ? (
          <section style={accessibleSectionStyle}>
            <span style={{ display: "block", color: "#7dd3fc", fontSize: 9, fontWeight: 800, letterSpacing: ".18em", marginBottom: 5 }}>AUTHORIZED ROOMS</span>
            <h2 style={accessibleSectionTitleStyle}>我可进入的协作房间</h2>
            <div className="accessible-room-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 240px), 1fr))", gap: 10 }}>
              {accessibleRooms.map((room) => (
                <Link
                  key={room.roomId}
                  href={`/chat?roomId=${room.roomId}`}
                  style={accessibleRoomLinkStyle}
                >
                  <span>进入 {room.ownerName} 的房间</span>
                  <span aria-hidden="true">↗</span>
                </Link>
              ))}
            </div>
          </section>
        ) : null}
      </div>
      <style>{`
        a[href="/"]:hover, a[href="/login"]:hover, a[href="/teacher"]:hover,
        .accessible-room-grid a:hover {
          filter: brightness(1.15);
          transform: translateY(-1px);
          border-color: rgba(125,211,252,.48) !important;
        }
        a[href="/"]:focus-visible, a[href="/login"]:focus-visible, a[href="/teacher"]:focus-visible,
        .accessible-room-grid a:focus-visible { outline: 2px solid #7dd3fc; outline-offset: 3px; }
        @media (max-width: 620px) {
          .accessible-room-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </main>
  );
}
