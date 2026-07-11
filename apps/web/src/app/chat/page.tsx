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
  background: "linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)",
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
};

const containerStyle: CSSProperties = {
  maxWidth: "960px",
  margin: "0 auto",
  padding: "32px 24px 64px",
};

const pageTitleStyle: CSSProperties = {
  fontSize: "28px",
  fontWeight: "700",
  color: "#fff",
  marginBottom: "8px",
  letterSpacing: "-0.02em",
};

const pageSubtitleStyle: CSSProperties = {
  fontSize: "14px",
  color: "rgba(255, 255, 255, 0.5)",
  marginBottom: "32px",
};

const degradedBannerStyle: CSSProperties = {
  background: "rgba(239, 68, 68, 0.1)",
  border: "1px solid rgba(239, 68, 68, 0.3)",
  borderRadius: "8px",
  padding: "12px 16px",
  marginBottom: "24px",
  color: "#f87171",
  fontSize: "14px",
};

const accessibleSectionStyle: CSSProperties = {
  marginTop: "24px",
  background: "rgba(255, 255, 255, 0.05)",
  border: "1px solid rgba(255, 255, 255, 0.1)",
  borderRadius: "12px",
  padding: "20px 24px",
};

const accessibleSectionTitleStyle: CSSProperties = {
  fontSize: "16px",
  fontWeight: "600",
  color: "#fff",
  marginBottom: "16px",
};

const accessibleRoomLinkStyle: CSSProperties = {
  display: "block",
  padding: "10px 14px",
  marginBottom: "8px",
  background: "rgba(99, 102, 241, 0.12)",
  border: "1px solid rgba(99, 102, 241, 0.3)",
  borderRadius: "8px",
  color: "#a5b4fc",
  fontSize: "14px",
  textDecoration: "none",
  transition: "background 0.2s",
};

const emptyStateStyle: CSSProperties = {
  color: "rgba(255, 255, 255, 0.6)",
  fontSize: "14px",
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
          <h1 style={pageTitleStyle}>个人聊天室</h1>
          <p style={emptyStateStyle}>请先登录学生账号。</p>
        </div>
      </main>
    );
  }

  if (result.status === "api-unreachable") {
    return (
      <main style={pageStyle} data-scrollable="true">
        <div style={containerStyle}>
          <SessionBanner />
          <h1 style={pageTitleStyle}>个人聊天室</h1>
          <p style={{ color: "#fbbf24" }}>教学 API 暂不可达，请稍后刷新重试。</p>
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
          <h1 style={pageTitleStyle}>个人聊天室</h1>
          <p style={emptyStateStyle}>当前账号无权进入个人聊天室。</p>
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
          <h1 style={pageTitleStyle}>Teacher 观察</h1>
          <p style={emptyStateStyle}>请从教师工作台选择学生房间。</p>
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
          dayId={currentQuest?.id ?? "day-1"}
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
            <h2 style={accessibleSectionTitleStyle}>我可进入的协作房间</h2>
            <div>
              {accessibleRooms.map((room) => (
                <Link
                  key={room.roomId}
                  href={`/chat?roomId=${room.roomId}`}
                  style={accessibleRoomLinkStyle}
                >
                  进入 {room.ownerName} 的房间
                </Link>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}
