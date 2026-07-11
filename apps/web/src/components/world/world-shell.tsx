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
  fetchAgentAvatarsSafe,
  fetchAgentAvatarsSafeWithToken,
  getQuestListSafe,
  getActiveClassroomSafe,
  type AgentAvatar,
  type QuestSummary,
} from "../../lib/api-client";
import type { ClassroomSnapshot } from "contracts";
import { StudentClassroomBanner } from "../classroom/student-classroom-banner";
import { toDayLabel } from "../../lib/format";
import { clearSession, loadSession } from "../../lib/session";
import { WORLD_HUD_SAFE_AREAS } from "./world-hud";

/** Derive WebSocket URL from the current page origin (works in any environment). */
function getWsUrl(): string {
  if (typeof window !== "undefined") {
    return `${window.location.protocol}//${window.location.hostname}:3001`;
  }
  return "http://localhost:3001";
}

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
  padding: "7px 12px",
  border: "1px solid rgba(255,255,255,0.28)",
  borderRadius: "6px",
  background: "rgba(7,13,28,0.66)",
  color: "#fff",
  cursor: "pointer",
  fontSize: "14px",
  fontWeight: 700,
  textDecoration: "none",
  boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
  backdropFilter: "blur(8px)",
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

export function WorldShell() {
  const router = useRouter();
  const [activeZone, setActiveZone] = useState<ZoneId>("lobby");
  const [questLogOpen, setQuestLogOpen] = useState(false);
  const [activeNpc, setActiveNpc] = useState<string | null>(null);
  const [isSwitching, setIsSwitching] = useState(false);
  const [quests, setQuests] = useState<QuestSummary[]>([]);
  const [gameReady, setGameReady] = useState(false);
  const [studentId, setStudentId] = useState("student-1");
  const [classroomSnapshot, setClassroomSnapshot] = useState<ClassroomSnapshot | null>(null);
  const [classroomToken, setClassroomToken] = useState("");
  const gameRef = useRef<DestroyableGame | undefined>(undefined);
  const currentSceneRef = useRef<string>(ZONE_SCENE_KEYS["lobby"]);
  const avatarsRef = useRef<AgentAvatar[]>([]);

  const handleLogout = () => {
    clearSession();
    router.push("/login");
  };

  // Fetch quest data
  useEffect(() => {
    if (process.env.NODE_ENV === "test") return;

    const session = loadSession();
    const token = session?.token;
    if (session?.user.role === "student") {
      setStudentId(session.user.id);
      setClassroomToken(token ?? "");
      if (token) {
        getActiveClassroomSafe(token).then(({ data }) => setClassroomSnapshot(data)).catch(() => {});
      }
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

      const { avatars } = token
        ? await fetchAgentAvatarsSafeWithToken(token)
        : await fetchAgentAvatarsSafe();
      if (disposed) return;

      avatarsRef.current = avatars;

      const game = gameRef.current;
      if (game) {
        game.registry.set("agent-avatars", avatars);
        game.registry.events.emit("agent-state-changed", {
          studentId: "__refresh__",
          status: "online",
          zone: undefined,
        });
      }
    }

    void loadAvatars();

    // Periodic REST polling as a fallback (every 30s)
    const pollInterval = setInterval(() => {
      void loadAvatars();
    }, 30000);

    // WebSocket connection for real-time agent status updates
    let socket: ReturnType<typeof io> | undefined;
    try {
      const session = loadSession();
      const token = session?.token;

      socket = io(getWsUrl(), {
        transports: ["websocket"],
        autoConnect: true,
        reconnection: true,
        reconnectionAttempts: 3,
        auth: token ? { token } : undefined,
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
        const current =
          (game.registry.get("agent-avatars") as AgentAvatar[] | undefined) ??
          [];
        const updated = current.map((a) =>
          a.studentId === payload.studentId
            ? {
                ...a,
                status: payload.status as AgentAvatar["status"],
                activitySummary: payload.activitySummary,
              }
            : a,
        );
        game.registry.set("agent-avatars", updated);

        // Notify Phaser scene to re-render
        game.registry.events.emit("agent-state-changed", {
          studentId: payload.studentId,
          status: payload.status,
          zone: payload.currentZone,
        });
      });
    } catch {
      // WebSocket connection failed — REST polling remains active
    }

    return () => {
      disposed = true;
      clearInterval(pollInterval);
      socket?.disconnect();
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
        height: "100vh",
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
          zIndex: 10,
          display: "flex",
          justifyContent: "center",
          flexDirection: "row",
          gap: "4px",
          padding: "4px",
          background: "rgba(7,13,28,0.76)",
          border: "1px solid rgba(255,255,255,0.18)",
          borderRadius: "6px",
          transform: "translateX(-50%)",
          boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
          backdropFilter: "blur(8px)",
          pointerEvents: "none",
        }}
      >
        {ZONE_DEFS.map((zone) => (
          <button
            key={zone.id}
            role="tab"
            aria-selected={activeZone === zone.id}
            onClick={() => switchZone(zone.id)}
            style={{
              pointerEvents: "auto",
              padding: "7px 12px",
              border:
                activeZone === zone.id
                  ? "1px solid rgba(255,255,255,0.72)"
                  : "1px solid rgba(255,255,255,0.14)",
              borderRadius: "4px",
              background:
                activeZone === zone.id
                  ? "rgba(255,255,255,0.24)"
                  : "rgba(4,8,18,0.46)",
              color: "#fff",
              cursor: "pointer",
              fontSize: "14px",
              fontWeight: activeZone === zone.id ? "bold" : "normal",
              backdropFilter: "blur(8px)",
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
        <Link href="/agent-team" style={floatBtn}>
          🤖 战队
        </Link>
        <Link href="/teacher" style={floatBtn}>
          📚 课程
        </Link>
        <button onClick={handleLogout} style={floatBtn}>
          🚪 退出
        </button>
      </div>

      {/* World channel floating button — bottom left */}
      <Link
        href="/chat"
        style={{
          position: "absolute",
          bottom: 24,
          left: 24,
          zIndex: 10,
          padding: "9px 14px",
          background: "rgba(15, 87, 118, 0.82)",
          border: "1px solid rgba(255,255,255,0.32)",
          borderRadius: "6px",
          color: "#fff",
          cursor: "pointer",
          fontSize: "14px",
          fontWeight: "bold",
          textDecoration: "none",
          backdropFilter: "blur(8px)",
          boxShadow: "0 10px 28px rgba(0,0,0,0.22)",
        }}
      >
        💬 世界频道
      </Link>

      {/* Quest log floating button — bottom right */}
      <button
        onClick={() => setQuestLogOpen(!questLogOpen)}
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
          borderRadius: "6px",
          color: "#fff",
          cursor: "pointer",
          fontSize: "14px",
          fontWeight: "bold",
          backdropFilter: "blur(8px)",
          boxShadow: "0 10px 28px rgba(0,0,0,0.22)",
        }}
      >
        📋 任务日志
      </button>

      {/* Quest log slide-out panel */}
      <div
        role="region"
        aria-label="任务日志"
        style={{
          position: "absolute",
          top: 0,
          right: 0,
          bottom: 0,
          width: 320,
          background: "rgba(0,0,0,0.8)",
          zIndex: 15,
          padding: "64px 16px 16px",
          transform: questLogOpen ? "translateX(0)" : "translateX(100%)",
          transition: "transform 0.3s ease",
          overflowY: "auto",
          color: "#fff",
        }}
      >
        <h2 style={{ margin: "0 0 16px", fontSize: "18px" }}>📋 任务日志</h2>
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
                    borderRadius: "6px",
                    opacity: isActive ? 1 : 0.5,
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

      {classroomSnapshot && classroomToken ? (
        <StudentClassroomBanner
          snapshot={classroomSnapshot}
          token={classroomToken}
          studentId={studentId}
        />
      ) : null}

      {/* Phaser mount — full screen */}
      <div
        id={PIXEL_WORLD_MOUNT_ID}
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
    </section>
  );
}
