"use client";

import Link from "next/link";
import { ZONE_DEFS, type AgentDef, type NpcDef, type ZoneId } from "./zone-config";
import type {
  AgentAvatar,
  QuestSummary,
  ReviewQueuePayload,
} from "../../lib/api-client";

export type SelectedWorldActor = {
  kind: "agent" | "npc";
  id: string;
} | null;

type TeacherObserverPanelProps = {
  activeZone: ZoneId;
  avatars: AgentAvatar[];
  quests: QuestSummary[];
  reviewQueue: ReviewQueuePayload;
  selectedActor: SelectedWorldActor;
  onClearActor: () => void;
};

const ZONE_COPY: Record<ZoneId, {
  eyebrow: string;
  title: string;
  summary: string;
  marker: string;
  primaryAction: string;
  href: string;
}> = {
  lobby: {
    eyebrow: "CITY ENTRY",
    title: "入口与导览",
    summary: "从这里确认课堂在线情况，并快速进入需要观察的区域。",
    marker: "区域入口",
    primaryAction: "打开区域导览",
    href: "/",
  },
  workstations: {
    eyebrow: "AGENT RUNTIME",
    title: "Agent 运行状态",
    summary: "查看每个 Agent 当前做什么、多久没有心跳，以及是否需要介入。",
    marker: "最近心跳",
    primaryAction: "打开任务详情",
    href: "/teacher",
  },
  "collab-room": {
    eyebrow: "SHARED MEMORY",
    title: "交接与共享记忆",
    summary: "确认多个 Agent 是否在同一房间协作，以及共享记忆是否已经同步。",
    marker: "共享记忆",
    primaryAction: "打开交接记录",
    href: "/chat",
  },
  "review-station": {
    eyebrow: "EVIDENCE DESK",
    title: "证据与裁定",
    summary: "先看待评审数量和证据完整度，再进入教师工作台做最终判断。",
    marker: "证据完整度",
    primaryAction: "打开教师评审台",
    href: "/teacher",
  },
};

function statusLabel(status: AgentAvatar["status"]): string {
  return {
    online: "在线",
    working: "工作中",
    reviewing: "评审中",
    idle: "空闲",
    offline: "离线",
  }[status];
}

function findAgent(id: string): { kind: "agent"; agent: AgentDef; zone: ZoneId } | undefined {
  for (const zone of ZONE_DEFS) {
    const agent = zone.agents.find((item) => item.id === id);
    if (agent) return { kind: "agent", agent, zone: zone.id };
  }
  return undefined;
}

function findNpc(id: string): { kind: "npc"; npc: NpcDef; zone: ZoneId } | undefined {
  for (const zone of ZONE_DEFS) {
    const npc = zone.npcs.find((item) => item.id === id);
    if (npc) return { kind: "npc", npc, zone: zone.id };
  }
  return undefined;
}

function metricClass(tone: "info" | "healthy" | "pending" | "risk") {
  return `teacher-observer-metric teacher-observer-metric-${tone}`;
}

export function TeacherObserverPanel({
  activeZone,
  avatars,
  quests,
  reviewQueue,
  selectedActor,
  onClearActor,
}: TeacherObserverPanelProps) {
  const copy = ZONE_COPY[activeZone];

  return (
    <aside
      role="region"
      className="teacher-observer-panel"
      aria-label="教师主城区观察"
      data-observer-zone={activeZone}
    >
      {selectedActor ? (
        <ActorProfile
          selectedActor={selectedActor}
          avatars={avatars}
          onClearActor={onClearActor}
        />
      ) : (
        <ZoneOverview
          activeZone={activeZone}
          copy={copy}
          avatars={avatars}
          quests={quests}
          reviewQueue={reviewQueue}
        />
      )}
    </aside>
  );
}

function ZoneOverview({
  activeZone,
  copy,
  avatars,
  quests,
  reviewQueue,
}: {
  activeZone: ZoneId;
  copy: (typeof ZONE_COPY)[ZoneId];
  avatars: AgentAvatar[];
  quests: QuestSummary[];
  reviewQueue: ReviewQueuePayload;
}) {
  const onlineCount = avatars.filter((avatar) => avatar.status !== "offline").length;
  const workstationCount = avatars.filter((avatar) => avatar.currentZone === "workstations").length;
  const collabCount = avatars.filter((avatar) => avatar.currentZone === "collab-room").length;
  const openQuestCount = quests.filter((quest) => quest.status === "open").length;
  const metrics = activeZone === "lobby"
    ? [
        ["课堂在线", `${onlineCount || "--"} 人`, "healthy"],
        ["可用入口", "4 个", "info"],
        ["公告更新", "实时", "info"],
      ]
    : activeZone === "workstations"
      ? [
          ["工位 Agent", `${workstationCount || "--"}`, "info"],
          ["进行中", `${avatars.filter((avatar) => avatar.status === "working").length || "--"}`, "healthy"],
          ["任务开放", `${openQuestCount || "--"}`, "pending"],
        ]
      : activeZone === "collab-room"
        ? [
            ["参与 Agent", `${collabCount || "--"}`, "info"],
            ["记忆同步", "同步中", "healthy"],
            ["待回应", "--", "pending"],
          ]
        : [
            ["待评审", `${reviewQueue.summary.pendingCount}`, "pending"],
            ["AI 初评", `${reviewQueue.summary.reviewedToday}`, "healthy"],
            ["风险提示", `${reviewQueue.summary.flaggedCount}`, "risk"],
          ];

  return (
    <>
      <ObserverPanelTop eyebrow={copy.eyebrow} />
      <div className="teacher-observer-content" data-zone-panel={activeZone}>
        <span className="teacher-observer-kicker">CURRENT ZONE</span>
        <h2>{copy.title}</h2>
        <p className="teacher-observer-summary">{copy.summary}</p>
        <div className="teacher-observer-metrics">
          {metrics.map(([label, value, tone]) => (
            <div key={label} className={metricClass(tone as "info" | "healthy" | "pending" | "risk")}>
              <span>{label}</span>
              <b>{value}</b>
            </div>
          ))}
        </div>
        <div className="teacher-observer-sections">
          <ObserverRow label={copy.marker} value={activeZone === "workstations" ? "点击 Agent 查看" : activeZone === "review-station" ? "后端队列" : "实时状态"} />
          <ObserverRow label="当前区域" value={ZONE_DEFS.find((zone) => zone.id === activeZone)?.label ?? "主城区"} />
          <ObserverRow label="下一动作" value={copy.primaryAction.replace("打开", "")} />
        </div>
        <Link className="teacher-observer-action" href={copy.href}>
          {copy.primaryAction} <span aria-hidden="true">↗</span>
        </Link>
        <p className="teacher-observer-note">教师观察模式只读，业务写操作仍在正式页面完成。</p>
      </div>
    </>
  );
}

function ActorProfile({
  selectedActor,
  avatars,
  onClearActor,
}: {
  selectedActor: Exclude<SelectedWorldActor, null>;
  avatars: AgentAvatar[];
  onClearActor: () => void;
}) {
  const found = selectedActor.kind === "agent"
    ? findAgent(selectedActor.id)
    : findNpc(selectedActor.id);

  if (!found) return null;

  const actor = found.kind === "agent" ? found.agent : found.npc;
  const avatar = found.kind === "agent"
    ? avatars.find((item) => item.studentId === found.agent.studentId)
    : undefined;
  const displayName = avatar?.displayName ?? ("label" in actor ? actor.label : actor.name);
  const status = avatar ? statusLabel(avatar.status) : "在线";
  const task = avatar?.activitySummary ?? actor.tooltip;
  const zoneLabel = ZONE_DEFS.find((zone) => zone.id === found.zone)?.label ?? "主城区";

  return (
    <>
      <ObserverPanelTop eyebrow={found.kind === "agent" ? "CURRENT AGENT" : "CURRENT NPC"} />
      <div className="teacher-observer-content teacher-observer-profile" data-observer-actor={selectedActor.id}>
        <button className="teacher-observer-back" type="button" onClick={onClearActor}>
          ← 返回{zoneLabel}概览
        </button>
        <span className="teacher-observer-kicker">{found.kind === "agent" ? "AGENT PROFILE" : "NPC PROFILE"}</span>
        <h2>{displayName}</h2>
        <p className="teacher-observer-role">{"label" in actor ? "Agent 工作角色" : actor.name}</p>
        <div className="teacher-observer-state"><span>当前状态</span><b>{status}</b></div>
        <div className="teacher-observer-sections">
          <ObserverRow label="当前区域" value={zoneLabel} />
          <ObserverRow label="当前任务" value={task} />
          <ObserverRow
            label="最近心跳"
            value={avatar?.lastActiveAt
              ? new Date(avatar.lastActiveAt).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })
              : "场景实时"}
          />
          <ObserverRow label="教师权限" value="仅查看" />
        </div>
        <Link className="teacher-observer-action" href={found.kind === "agent" ? "/teacher" : "/chat"}>
          查看关联页面 <span aria-hidden="true">↗</span>
        </Link>
        <p className="teacher-observer-note">观察层不修改任务、Agent 状态或 NPC 对话。</p>
      </div>
    </>
  );
}

function ObserverPanelTop({ eyebrow }: { eyebrow: string }) {
  return (
    <div className="teacher-observer-top">
      <span>{eyebrow}</span>
      <b>只读观察</b>
    </div>
  );
}

function ObserverRow({ label, value }: { label: string; value: string }) {
  return <div className="teacher-observer-row"><span>{label}</span><b>{value}</b></div>;
}
