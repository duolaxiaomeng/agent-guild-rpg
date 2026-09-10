"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { io } from "socket.io-client";
import {
  createWorldGame,
  PIXEL_WORLD_MOUNT_ID,
  ZONE_SCENE_KEYS,
  type DestroyableGame,
} from "./phaser-scene";
import { ZONE_DEFS, type NpcDef, type ZoneId } from "./zone-config";
import { NpcDialog } from "./npc-dialog";
import {
  fetchAgentAvatarWithToken,
  fetchAgentAvatarsSafe,
  fetchAgentAvatarsSafeWithToken,
  fetchMyAgentAvatarWithToken,
  getQuestListSafe,
  moveMyAgentToZone,
  type AgentAvatar,
  type AgentZone,
  type QuestSummary,
} from "../../lib/api-client";
import type {
  AvatarMoveAck,
  AvatarMoveCommand,
  AvatarMovement,
} from "contracts";
import { toDayLabel } from "../../lib/format";
import { clearSession, loadSession } from "../../lib/session";
import { WORLD_HUD_SAFE_AREAS } from "./world-hud";
import { getRealtimeUrl } from "../../lib/realtime-url";

/** Find an NPC definition by id across all zones. */
function findNpcById(npcId: string): { npc: NpcDef; zoneId: string } | undefined {
  for (const zone of ZONE_DEFS) {
    const npc = zone.npcs.find((n) => n.id === npcId);
    if (npc) return { npc, zoneId: zone.id };
  }
  return undefined;
}

function toQuestStatusLabel(status: QuestSummary["status"]): string {
  if (status === "completed") return "已完成";
  if (status === "open") return "进行中";
  return "未解锁";
}

const floatBtn: React.CSSProperties = {
  minHeight: 34,
  padding: "7px 11px",
  border: "1px solid rgba(148, 210, 255, 0.32)",
  borderRadius: "4px",
  background: "linear-gradient(180deg, rgba(20,35,66,.94), rgba(7,13,28,.94))",
  color: "#e0f2fe",
  cursor: "pointer",
  fontSize: "12px",
  fontWeight: 700,
  textDecoration: "none",
  boxShadow: "0 3px 0 rgba(2,6,23,.78), inset 0 1px 0 rgba(255,255,255,.08)",
  backdropFilter: "blur(8px)",
  transition: "transform 120ms ease, border-color 120ms ease, color 120ms ease",
};

export function syncWorldScene(
  game: DestroyableGame,
  currentSceneKey: string,
  nextZoneId: ZoneId,
): string {
  const nextKey = ZONE_SCENE_KEYS[nextZoneId];

  if (currentSceneKey !== nextKey && game.scene.isActive(currentSceneKey)) {
    game.scene.stop(currentSceneKey);
  }

  if (!game.scene.isActive(nextKey)) {
    game.scene.start(nextKey);
  }

  return nextKey;
}

type WorldShellProps = {
  initialZone?: ZoneId;
};

export function WorldShell({ initialZone = "lobby" }: WorldShellProps = {}) {
  const router = useRouter();
  const [activeZone, setActiveZone] = useState<ZoneId>(initialZone);
  const [questLogOpen, setQuestLogOpen] = useState(false);
  const [activeNpc, setActiveNpc] = useState<string | null>(null);
  const [isSwitching, setIsSwitching] = useState(false);
  const [quests, setQuests] = useState<QuestSummary[]>([]);
  const [gameReady, setGameReady] = useState(false);
  const [studentId, setStudentId] = useState("student-1");
  const [privateAvatar, setPrivateAvatar] = useState<AgentAvatar | null>();
  const [privateAvatarDegraded, setPrivateAvatarDegraded] = useState(false);
  const gameRef = useRef<DestroyableGame | undefined>(undefined);
  const socketRef = useRef<ReturnType<typeof io> | undefined>(undefined);
  const currentSceneRef = useRef<string>(ZONE_SCENE_KEYS[initialZone]);
  const avatarsRef = useRef<AgentAvatar[]>([]);
  const activeZoneRef = useRef<ZoneId>(initialZone);
  const controlledAgentIdRef = useRef<string | null>(null);

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" }).catch(() => undefined);
    clearSession();
    router.push("/login");
  };

  // Fetch quest data
  useEffect(() => {
    if (process.env.NODE_ENV === "test") return;

    const session = loadSession();
    const token = session?.token;
    if (session) {
      setStudentId(session.user.id);
      controlledAgentIdRef.current = session.user.id;
      void moveMyAgentToZone(initialZone as AgentZone, token ?? "").catch(() => undefined);
    }
    getQuestListSafe(token).then(({ data }) => setQuests(data)).catch(() => {});
  }, []);

  // Fetch agent avatars from REST API and sync into Phaser registry
  useEffect(() => {
    if (process.env.NODE_ENV === "test") {
      return;
    }

    let disposed = false;

    async function loadAvatars() {
      const session = loadSession();
      const token = session?.token;

      const [{ avatars }, ownResult] = await Promise.all([
        token
          ? fetchAgentAvatarsSafeWithToken(token)
          : fetchAgentAvatarsSafe(),
        session?.user.role === "student"
          ? fetchMyAgentAvatarWithToken(token ?? "")
              .then((avatar) => ({ avatar, degraded: false }))
              .catch(() => ({ avatar: null, degraded: true }))
          : Promise.resolve({ avatar: null, degraded: false }),
      ]);
      if (disposed) return;

      const ownAvatar = ownResult.avatar
        ? { ...ownResult.avatar, currentZone: activeZoneRef.current }
        : null;
      setPrivateAvatar(ownAvatar);
      setPrivateAvatarDegraded(ownResult.degraded);
      const normalizedAvatars = [
        ...avatars.filter((avatar) => avatar.studentId !== session?.user.id),
        ...(ownAvatar ? [ownAvatar] : []),
      ];
      avatarsRef.current = normalizedAvatars;

      const game = gameRef.current;
      if (game) {
        game.registry.set("agent-avatars", normalizedAvatars);
        game.registry.set("controlled-agent-id", session?.user.id ?? null);
        game.registry.events.emit("agent-state-changed", {
          studentId: "__refresh__",
          status: "online",
          zone: undefined,
        });
      }
    }

    void loadAvatars();

    // REST is only a safety calibration path. Give every client a different
    // 30-60 second cadence so a classroom does not stampede the API together.
    let pollTimer: ReturnType<typeof setTimeout> | undefined;
    const schedulePoll = () => {
      if (disposed) return;
      pollTimer = setTimeout(() => {
        void loadAvatars().finally(schedulePoll);
      }, 30_000 + Math.floor(Math.random() * 30_001));
    };
    schedulePoll();

    // WebSocket connection for real-time agent status updates
    let socket: ReturnType<typeof io> | undefined;
    try {
      const session = loadSession();
      const token = session?.token;

      socket = io(getRealtimeUrl(), {
        transports: ["websocket"],
        autoConnect: true,
        reconnection: true,
        reconnectionAttempts: 3,
        auth: token ? { token } : undefined,
        withCredentials: true,
      });
      socketRef.current = socket;

      socket.on("connect", () => {
        socket?.emit("zone:subscribe", { zone: "main_city" });
        for (const zone of ZONE_DEFS) {
          socket?.emit("zone:subscribe", { zone: zone.id });
        }
        // The server marks this user online during the handshake, before this
        // client has joined the public-hall room. Reload once after connect so
        // the user's own avatar is visible immediately instead of waiting for
        // the polling fallback.
        void loadAvatars();
      });

      socket.on("presence:update", (payload: {
        userId: string;
        state: "online" | "offline";
      }) => {
        const applyPresence = async () => {
          const game = gameRef.current;
          if (!game) return;

          if (payload.state === "offline") {
            const next = avatarsRef.current.filter(
              (avatar) => avatar.studentId !== payload.userId
            );
            avatarsRef.current = next;
            game.registry.set("agent-avatars", next);
            game.registry.events.emit("agent-state-changed", {
              studentId: payload.userId,
              status: "offline",
              zone: undefined,
            });
            return;
          }

          if (payload.userId === controlledAgentIdRef.current) {
            await loadAvatars();
            return;
          }

          if (!token) return;
          const avatar = await fetchAgentAvatarWithToken(payload.userId, token);
          if (disposed) return;
          const existed = avatarsRef.current.some(
            (item) => item.studentId === avatar.studentId
          );
          const next = [
            ...avatarsRef.current.filter(
              (item) => item.studentId !== avatar.studentId
            ),
            avatar,
          ];
          avatarsRef.current = next;
          game.registry.set("agent-avatars", next);
          game.registry.events.emit("agent-state-changed", {
            studentId: existed ? avatar.studentId : "__refresh__",
            status: avatar.status,
            zone: avatar.currentZone,
          });
        };

        void applyPresence().catch(() => {
          // The randomized REST calibration will repair a missed delta.
        });
      });

      socket.on("agent-status:update", (payload: {
        studentId: string;
        displayName: string;
        status: string;
        currentZone: string;
        activitySummary: string;
      }) => {
        const game = gameRef.current;
        if (!game) return;

        // Update avatar data in the registry
        const current = avatarsRef.current;
        const locked = payload.status === "working" || payload.status === "reviewing";
        const movementLockReason: AgentAvatar["movementLockReason"] = locked
          ? payload.status === "reviewing" ? "reviewing" : "task_running"
          : null;
        const updated = current.map((a) =>
          a.studentId === payload.studentId
            ? {
                ...a,
                status: payload.status as AgentAvatar["status"],
                activitySummary: payload.activitySummary,
                movementLocked: locked,
                movementLockReason,
              }
            : a,
        );
        avatarsRef.current = updated;
        game.registry.set("agent-avatars", updated);
        if (payload.studentId === controlledAgentIdRef.current) {
          const ownAvatar = updated.find((avatar) => avatar.studentId === payload.studentId);
          setPrivateAvatar(ownAvatar ?? null);
        }

        // Notify Phaser scene to re-render
        game.registry.events.emit("agent-state-changed", {
          studentId: payload.studentId,
          status: payload.status,
          zone: payload.currentZone,
        });
      });

      socket.on("avatar:movement", (movement: AvatarMovement) => {
        if (movement.studentId !== controlledAgentIdRef.current) return;
        const updated = avatarsRef.current.map((avatar) =>
          avatar.studentId === movement.studentId
            ? {
                ...avatar,
                position: {
                  zone: "workstations" as const,
                  x: movement.targetX,
                  y: movement.targetY,
                  facing: movement.facing,
                  revision: movement.revision,
                  updatedAt: movement.updatedAt,
                },
              }
            : avatar,
        );
        avatarsRef.current = updated;
        const ownAvatar = updated.find((avatar) => avatar.studentId === movement.studentId);
        if (ownAvatar) setPrivateAvatar(ownAvatar);
        const game = gameRef.current;
        if (!game) return;
        game.registry.set("agent-avatars", updated);
        game.registry.events.emit("avatar-movement", movement);
      });
    } catch {
      // WebSocket connection failed — REST polling remains active
    }

    return () => {
      disposed = true;
      if (pollTimer) clearTimeout(pollTimer);
      socket?.disconnect();
      if (socketRef.current === socket) socketRef.current = undefined;
    };
  }, []);

  useEffect(() => {
    if (process.env.NODE_ENV === "test") {
      return;
    }

    let disposed = false;

    async function bootWorld() {
      const initialScene = currentSceneRef.current;
      const nextGame = await createWorldGame(PIXEL_WORLD_MOUNT_ID, initialScene);

      if (disposed) {
        nextGame.destroy(true);
        return;
      }

      gameRef.current = nextGame;
      nextGame.registry.set("controlled-agent-id", controlledAgentIdRef.current);
      nextGame.registry.set(
        "avatar-move-sender",
        (
          command: AvatarMoveCommand,
          onAck: (ack: AvatarMoveAck) => void,
        ) => {
          const socket = socketRef.current;
          if (!socket?.connected) {
            onAck({ accepted: false, reason: "authentication_required" });
            return;
          }
          socket.emit("avatar:move", command, onAck);
        },
      );
      setGameReady(true);

      // Sync already-fetched avatars into the game registry
      if (avatarsRef.current.length > 0) {
        nextGame.registry.set("agent-avatars", avatarsRef.current);
      }

      // Listen for NPC click events from Phaser scenes
      nextGame.registry.events.on("npc-clicked", (npcId: string) => {
        setActiveNpc(npcId);
      });
    }

    void bootWorld();

    return () => {
      disposed = true;
      setGameReady(false);
      if (gameRef.current) {
        gameRef.current.registry.events.removeAllListeners("npc-clicked");
        gameRef.current.registry.events.removeAllListeners("agent-state-changed");
        gameRef.current.registry.events.removeAllListeners("avatar-movement");
      }
      gameRef.current?.destroy(true);
    };
  }, []);

  useEffect(() => {
    if (process.env.NODE_ENV === "test") {
      return;
    }

    const game = gameRef.current;
    if (!game || !gameReady) return;

    currentSceneRef.current = syncWorldScene(
      game,
      currentSceneRef.current,
      activeZone,
    );
  }, [activeZone, gameReady]);

  function switchZone(zoneId: ZoneId) {
    if (isSwitching) return;

    activeZoneRef.current = zoneId;
    const controlledAgentId = controlledAgentIdRef.current;
    if (controlledAgentId) {
      avatarsRef.current = avatarsRef.current.map((avatar) =>
        avatar.studentId === controlledAgentId
          ? { ...avatar, currentZone: zoneId }
          : avatar,
      );
      const ownAvatar = avatarsRef.current.find(
        (avatar) => avatar.studentId === controlledAgentId,
      );
      if (ownAvatar) setPrivateAvatar(ownAvatar);
      gameRef.current?.registry.set("agent-avatars", avatarsRef.current);
      const session = loadSession();
      void moveMyAgentToZone(zoneId as AgentZone, session?.token ?? "").catch(
        () => undefined,
      );
    }

    const game = gameRef.current;
    if (!game) {
      setActiveZone(zoneId);
      currentSceneRef.current = ZONE_SCENE_KEYS[zoneId];
      return;
    }

    const nextKey = ZONE_SCENE_KEYS[zoneId];
    const prevKey = currentSceneRef.current;

    if (prevKey === nextKey) return;

    setIsSwitching(true);

    currentSceneRef.current = syncWorldScene(game, prevKey, zoneId);
    setActiveZone(zoneId);

    setTimeout(() => setIsSwitching(false), 300);
  }

  return (
    <section
      data-active-zone={activeZone}
      data-hud-safe-top={WORLD_HUD_SAFE_AREAS.top}
      data-hud-safe-bottom={WORLD_HUD_SAFE_AREAS.bottom}
      style={{
        width: "100%",
        height: "100%",
        minHeight: 0,
        position: "relative",
        "--world-hud-safe-top": `${WORLD_HUD_SAFE_AREAS.top}px`,
        "--world-hud-safe-bottom": `${WORLD_HUD_SAFE_AREAS.bottom}px`,
      } as React.CSSProperties}
    >
      {/* Floating tab bar */}
      <div
        role="tablist"
        aria-label="世界区域导航"
        className="world-zone-nav"
        data-layout="compact-top"
        style={{
          position: "absolute",
          top: 8,
          left: "50%",
          // Keep the interactive zone tabs above the separate page-level
          // topbar. At common 1280px classroom displays their bounds overlap.
          zIndex: 30,
          display: "flex",
          justifyContent: "center",
          flexDirection: "row",
          gap: "4px",
          padding: "4px",
          background: "linear-gradient(180deg, rgba(16,31,58,.94), rgba(5,11,25,.94))",
          border: "1px solid rgba(125,211,252,.35)",
          borderRadius: "5px",
          transform: "translateX(-50%)",
          boxShadow: "0 4px 0 rgba(2,6,23,.72), 0 12px 30px rgba(0,0,0,.24), inset 0 1px 0 rgba(255,255,255,.08)",
          backdropFilter: "blur(8px)",
          pointerEvents: "none",
        }}
      >
        {ZONE_DEFS.map((zone) => (
          <button
            key={zone.id}
            id={`world-zone-tab-${zone.id}`}
            role="tab"
            aria-selected={activeZone === zone.id}
            aria-controls={PIXEL_WORLD_MOUNT_ID}
            onClick={() => switchZone(zone.id)}
            className="world-zone-tab"
            style={{
              pointerEvents: "auto",
              padding: "7px 12px",
              border:
                activeZone === zone.id
                  ? "1px solid rgba(255,255,255,0.72)"
                  : "1px solid rgba(255,255,255,0.14)",
              borderRadius: "3px",
              background:
                activeZone === zone.id
                  ? "linear-gradient(180deg, rgba(14,116,144,.78), rgba(8,47,73,.92))"
                  : "rgba(4,8,18,0.46)",
              color: activeZone === zone.id ? "#e0f2fe" : "#cbd5e1",
              cursor: "pointer",
              fontSize: "14px",
              fontWeight: activeZone === zone.id ? "bold" : "normal",
              backdropFilter: "blur(8px)",
              boxShadow: activeZone === zone.id ? "inset 0 -2px 0 #38bdf8" : "none",
              transition: "background 120ms ease, color 120ms ease, transform 120ms ease",
            }}
          >
            {zone.emoji} {zone.label}
          </button>
        ))}
      </div>

      {/* Floating toolbar — top right */}
      <div
        className="world-toolbar"
        aria-label="世界工具栏"
        style={{
          position: "absolute",
          top: 8,
          right: 16,
          zIndex: 10,
          display: "flex",
          gap: "8px",
          alignItems: "center",
        }}
      >
        <Link href="/guilds" className="world-hud-action world-guild-action" style={floatBtn}>
          🤝 工会
        </Link>
        <Link href="/agent-team" className="world-hud-action world-team-action" style={floatBtn}>
          🤖 战队
        </Link>
        <Link href="/teacher" className="world-hud-action world-course-action" style={floatBtn}>
          📚 课程
        </Link>
        <button onClick={() => void handleLogout()} className="world-hud-action world-logout-action" style={floatBtn}>
          🚪 退出
        </button>
      </div>

      {/* World channel floating button — bottom left */}
      <Link
        href="/chat"
        className="world-quick-action world-chat-action"
        style={{
          position: "absolute",
          bottom: 24,
          left: 24,
          zIndex: 10,
          padding: "10px 14px",
          background: "linear-gradient(180deg, rgba(14,116,144,.94), rgba(8,47,73,.96))",
          border: "1px solid rgba(125,211,252,.5)",
          borderRadius: "4px",
          color: "#fff",
          cursor: "pointer",
          fontSize: "14px",
          fontWeight: "bold",
          textDecoration: "none",
          backdropFilter: "blur(8px)",
          boxShadow: "0 4px 0 rgba(2,36,54,.9), 0 10px 28px rgba(0,0,0,.22)",
          transition: "transform 120ms ease, filter 120ms ease",
        }}
      >
        💬 世界频道
      </Link>

      {/* Quest log floating button — bottom right */}
      <button
        onClick={() => setQuestLogOpen(!questLogOpen)}
        aria-expanded={questLogOpen}
        aria-controls="world-quest-log"
        className="world-quick-action world-quest-action"
        style={{
          position: "absolute",
          bottom: 24,
          right: 24,
          zIndex: 10,
          padding: "9px 14px",
          background: questLogOpen
            ? "rgba(171, 104, 18, 0.9)"
            : "rgba(7,13,28,0.68)",
          border: "1px solid rgba(255,255,255,0.32)",
          borderRadius: "4px",
          color: "#fff",
          cursor: "pointer",
          fontSize: "14px",
          fontWeight: "bold",
          backdropFilter: "blur(8px)",
          boxShadow: "0 4px 0 rgba(2,6,23,.78), 0 10px 28px rgba(0,0,0,.22)",
          transition: "transform 120ms ease, filter 120ms ease",
        }}
      >
        📋 任务日志
      </button>

      {/* Quest log slide-out panel */}
      <div
        id="world-quest-log"
        role="region"
        aria-label="任务日志"
        aria-hidden={!questLogOpen}
        style={{
          position: "absolute",
          top: 0,
          right: 0,
          bottom: 0,
          width: "min(340px, 92vw)",
          background: "linear-gradient(180deg, rgba(9,18,38,.98), rgba(3,8,20,.98))",
          zIndex: 40,
          padding: "64px 16px 16px",
          transform: questLogOpen ? "translateX(0)" : "translateX(100%)",
          transition: "transform 0.3s ease",
          overflowY: "auto",
          color: "#fff",
          borderLeft: "1px solid rgba(125,211,252,.28)",
          boxShadow: "-18px 0 40px rgba(0,0,0,.38)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            marginBottom: 16,
            paddingBottom: 12,
            borderBottom: "1px solid rgba(148,163,184,.16)",
          }}
        >
          <div>
            <span style={{ display: "block", color: "#7dd3fc", fontSize: 9, fontWeight: 800, letterSpacing: ".18em" }}>QUEST TERMINAL</span>
            <h2 style={{ margin: "4px 0 0", fontSize: "18px" }}>📋 任务日志</h2>
          </div>
          <button
            type="button"
            aria-label="收起任务日志"
            onClick={() => setQuestLogOpen(false)}
            style={{
              flex: "0 0 auto",
              padding: "7px 9px",
              border: "1px solid rgba(125,211,252,.32)",
              borderRadius: 4,
              background: "rgba(15,23,42,.72)",
              color: "#bae6fd",
              cursor: "pointer",
              fontSize: 11,
              fontWeight: 800,
            }}
          >
            收起 ‹
          </button>
        </div>
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {quests.length === 0 ? (
            <li style={{ padding: "12px", opacity: 0.5, fontSize: "13px" }}>
              暂无任务数据
            </li>
          ) : (
            quests.map((quest) => {
              const isActive = quest.status === "open" || quest.status === "completed";
              return (
                <li
                  key={quest.id}
                  style={{
                    padding: "12px",
                    marginBottom: 8,
                    background: isActive
                      ? "rgba(251, 191, 36, 0.2)"
                      : "rgba(255,255,255,0.05)",
                    border: `1px solid ${isActive ? "rgba(251, 191, 36, 0.5)" : "rgba(255,255,255,0.15)"}`,
                    borderRadius: "4px",
                    opacity: isActive ? 1 : 0.5,
                    boxShadow: isActive ? "inset 3px 0 0 #fbbf24" : "none",
                  }}
                >
                  <p
                    style={{
                      margin: 0,
                      fontWeight: "bold",
                      color: isActive ? "#fbbf24" : "#fff",
                    }}
                  >
                    📌 {toDayLabel(quest.id)}: {quest.title}
                  </p>
                  <p
                    style={{
                      margin: "4px 0 0",
                      fontSize: "12px",
                      color: quest.status === "completed" ? "#4ade80" : "#fbbf24",
                    }}
                  >
                    {toQuestStatusLabel(quest.status)}
                  </p>
                </li>
              );
            })
          )}
        </ul>
      </div>

      {/* Phaser mount — full screen */}
      <div
        id={PIXEL_WORLD_MOUNT_ID}
        role="tabpanel"
        aria-labelledby={`world-zone-tab-${activeZone}`}
        aria-label="像素世界画布"
        style={{ width: "100%", height: "100%" }}
      >
        {!gameReady && (
          <div
            style={{
              width: "100%",
              height: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "#1a1a2e",
              color: "#e0e0f0",
              fontSize: "18px",
              fontFamily: "system-ui, sans-serif",
            }}
          >
            世界加载中...
          </div>
        )}
      </div>

      {activeZone === "workstations" && privateAvatar !== undefined ? (
        <div
          role="status"
          aria-live="polite"
          style={{
            position: "absolute",
            left: "50%",
            bottom: 88,
            zIndex: 12,
            maxWidth: "min(520px, calc(100vw - 40px))",
            transform: "translateX(-50%)",
            padding: "9px 13px",
            border: `1px solid ${privateAvatar?.movementLocked ? "rgba(251,191,36,.56)" : "rgba(125,211,252,.4)"}`,
            borderRadius: 5,
            background: "rgba(4,10,24,.9)",
            color: privateAvatar?.movementLocked ? "#fde68a" : "#dbeafe",
            boxShadow: "0 4px 0 rgba(2,6,23,.72)",
            fontSize: 12,
            fontWeight: 700,
            textAlign: "center",
            pointerEvents: "none",
          }}
        >
          {privateAvatarDegraded
            ? "私人工位状态暂不可达，已停止生成和移动 Agent，等待真实数据恢复。"
            : !privateAvatar?.agentRole || !privateAvatar.visualRole || !privateAvatar.position
              ? "尚未接入或选角。启动 Connector 后，Agent 会根据本地项目自动选择工位角色。"
              : privateAvatar.movementLocked
                ? privateAvatar.movementLockReason === "reviewing"
                  ? "Agent 正在接受 AI 评审，已回到所属工位并锁定移动。"
                  : "Agent 正在执行真实任务，已回到所属工位并锁定移动。"
                : "点击空闲地面移动自己的 Agent；位置会实时同步并在刷新后保留。"}
        </div>
      ) : null}

      {/* NPC conversation dialog */}
      {activeNpc &&
        (() => {
          const found = findNpcById(activeNpc);
          if (!found) return null;
          return (
            <NpcDialog
              npcId={found.npc.id}
              npcName={found.npc.name}
              fallbackText={found.npc.tooltip}
              studentId={studentId}
              onClose={() => setActiveNpc(null)}
            />
          );
        })()}
      <style>{`
        .world-zone-tab:hover,
        .world-hud-action:hover,
        .world-quick-action:hover {
          filter: brightness(1.14);
          transform: translateY(-1px);
        }
        .world-zone-tab:focus-visible,
        .world-hud-action:focus-visible,
        .world-quick-action:focus-visible {
          outline: 2px solid #7dd3fc;
          outline-offset: 2px;
        }
        .world-hud-action:active,
        .world-quick-action:active { transform: translateY(2px); }
        @media (max-width: 760px) {
          .world-toolbar .world-hud-action::before { content: none !important; }
          .world-toolbar .world-team-action::after { content: "🤖"; font-size: 16px; }
          .world-toolbar .world-course-action::after { content: "📚"; font-size: 16px; }
          .world-toolbar .world-logout-action::after { content: "🚪"; font-size: 16px; }
          .world-toolbar .world-hud-action { display: inline-flex; align-items: center; justify-content: center; }
          .world-quick-action { bottom: 16px !important; }
        }
        @media (prefers-reduced-motion: reduce) {
          .world-zone-tab, .world-hud-action, .world-quick-action { transition: none !important; }
        }
      `}</style>
    </section>
  );
}
