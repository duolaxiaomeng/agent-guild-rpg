"use client";

import { useEffect, useState } from "react";
import { SessionBanner } from "../../components/auth/session-banner";
import { ChatRoom } from "../../components/chat/chat-room";
import { DayPanel } from "../../components/quests/day-panel";
import {
  getChatOverviewSafe,
  getCurrentSession,
  getQuestListSafe,
  getRoomAccessGrantsSafe,
  type ChatOverviewPayload,
  type QuestSummary,
  type RoomAccessGrant
} from "../../lib/api-client";
import { clearSession, loadSession, saveSession } from "../../lib/session";

type ChatPageState = {
  chatOverview: ChatOverviewPayload;
  quests: QuestSummary[];
  accessGrants: RoomAccessGrant[];
  degraded: boolean;
};

const EMPTY_CHAT_STATE = (studentId: string): ChatPageState => ({
  chatOverview: {
    studentId,
    studentName: "当前学生",
    agentLabel: "Agent 暂不可用",
    sessionStatus: "failed",
    sessionSummary: "实时教学 API 暂不可达，当前展示安全空态。",
    latestSubmission: null,
    collaborationGuests: []
  },
  quests: [],
  accessGrants: [],
  degraded: true
});

function toDayLabel(dayId: string) {
  return `Day ${dayId.replace("day-", "")}`;
}

function toDayStatus(status: QuestSummary["status"]) {
  if (status === "completed") {
    return "completed" as const;
  }

  if (status === "open") {
    return "current" as const;
  }

  return "locked" as const;
}

function toRewardText(status: QuestSummary["status"]) {
  if (status === "completed") {
    return "已达成，可进入回顾";
  }

  if (status === "open") {
    return "等待学生完成当日任务";
  }

  return "等待上一关完成后解锁";
}

function toSessionStatusLabel(status: ChatOverviewPayload["sessionStatus"]) {
  if (status === "active") {
    return "进行中";
  }

  if (status === "completed") {
    return "已完成";
  }

  return "异常结束";
}

function toSubmissionMeta(
  latestSubmission: ChatOverviewPayload["latestSubmission"]
) {
  if (!latestSubmission) {
    return undefined;
  }

  return `${latestSubmission.dayLabel} · ${latestSubmission.submittedAt
    .slice(0, 16)
    .replace("T", " ")}`;
}

function toRoomId(studentId: string) {
  return `room-chat-${studentId}`;
}

export function ChatPageClient() {
  const [state, setState] = useState<ChatPageState>(() => EMPTY_CHAT_STATE("student-1"));

  useEffect(() => {
    let disposed = false;

    async function loadChatPage() {
      const storedSession = loadSession();
      let studentId = "student-1";

      if (storedSession) {
        try {
          const nextSession = await getCurrentSession(storedSession.token);
          saveSession(nextSession);

          if (nextSession.user.role === "student") {
            studentId = nextSession.user.id;
          }
        } catch {
          clearSession();
        }
      }

      const roomId = toRoomId(studentId);
      const [
        { data: chatOverview, degraded: chatDegraded },
        { data: quests, degraded: questsDegraded },
        { data: accessGrants, degraded: grantsDegraded }
      ] = await Promise.all([
        getChatOverviewSafe(studentId),
        getQuestListSafe(),
        getRoomAccessGrantsSafe(roomId)
      ]);

      if (disposed) {
        return;
      }

      setState({
        chatOverview,
        quests,
        accessGrants,
        degraded: chatDegraded || questsDegraded || grantsDegraded
      });
    }

    void loadChatPage();

    return () => {
      disposed = true;
    };
  }, []);

  const currentQuest =
    state.quests.find((quest) => quest.status === "open") ?? state.quests[0];
  const dayItems = state.quests.map((quest) => ({
    id: quest.id,
    label: toDayLabel(quest.id),
    title: quest.title,
    status: toDayStatus(quest.status),
    reward: toRewardText(quest.status)
  }));

  return (
    <main>
      <SessionBanner />
      {state.degraded ? (
        <p>聊天、授权与关卡数据暂不可达，当前显示安全空态。</p>
      ) : null}
      <ChatRoom
        key={`${state.chatOverview.studentId}-${state.accessGrants.length}-${
          state.chatOverview.latestSubmission?.id ?? "no-submission"
        }`}
        studentName={state.chatOverview.studentName}
        studentId={state.chatOverview.studentId}
        roomId={toRoomId(state.chatOverview.studentId)}
        dayId={currentQuest?.id ?? "day-1"}
        agentLabel={state.chatOverview.agentLabel}
        sessionStatusLabel={toSessionStatusLabel(state.chatOverview.sessionStatus)}
        sessionSummary={state.chatOverview.sessionSummary}
        latestSubmissionStatus={
          state.chatOverview.latestSubmission?.statusLabel ?? "今日未提交"
        }
        latestSubmissionMeta={toSubmissionMeta(state.chatOverview.latestSubmission)}
        accessGrants={state.accessGrants}
        collaborationGuests={state.chatOverview.collaborationGuests.map((guest) => ({
          studentName: guest.studentName,
          contributionLabel: guest.contributionLabel
        }))}
      />
      <DayPanel currentDayId={currentQuest?.id ?? ""} days={dayItems} />
    </main>
  );
}
