"use client";

import { useEffect, useMemo, useState } from "react";
import {
  completeClassroomStage,
  extendClassroomStage,
  getActiveClassroomSafe,
  pauseClassroomStage,
  startClassroomStage,
  unlockNextClassroomStage
} from "../../lib/api-client";
import type { ClassroomSnapshot } from "contracts";

type Action = "start" | "pause" | "extend" | "complete" | "unlock-next";

export function ClassroomControlPanel({ snapshot, token }: { snapshot: ClassroomSnapshot; token: string }) {
  const [localSnapshot, setLocalSnapshot] = useState(snapshot);
  const [pending, setPending] = useState<Action | null>(null);
  const [feedback, setFeedback] = useState("");
  const [, setTick] = useState(0);

  useEffect(() => {
    setLocalSnapshot(snapshot);
  }, [snapshot]);

  useEffect(() => {
    const timer = window.setInterval(() => setTick((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, []);

  // A newly seeded/live classroom may not have currentStageId until the
  // teacher starts its first draft stage. Keep that first actionable stage
  // visible so the control panel can bootstrap the session.
  const stage = localSnapshot.currentStage ?? localSnapshot.stages.find((candidate) => candidate.status === "draft") ?? null;
  const remaining = useMemo(() => {
    if (!stage) return null;
    if (stage.status !== "running" || !stage.startedAt) return stage.remainingSeconds ?? null;
    const elapsed = Math.max(0, Math.floor((Date.now() - new Date(stage.startedAt).getTime()) / 1000));
    return Math.max(0, (stage.remainingSeconds ?? stage.durationSeconds + stage.extensionSeconds) - elapsed);
  }, [stage]);

  async function refreshAfterConflict() {
    const result = await getActiveClassroomSafe(token);
    if (!result.degraded) setLocalSnapshot(result.data);
  }

  async function runAction(action: Action) {
    if (!stage || !localSnapshot.viewer.canControlStages) return;
    setPending(action);
    setFeedback("");
    try {
      const result = action === "start"
        ? await startClassroomStage(stage.id, stage.version, token)
        : action === "pause"
          ? await pauseClassroomStage(stage.id, stage.version, token)
          : action === "extend"
            ? await extendClassroomStage(stage.id, 300, stage.version, token)
            : action === "complete"
              ? await completeClassroomStage(stage.id, stage.version, token)
              : await unlockNextClassroomStage(stage.id, stage.version, token);
      setLocalSnapshot(result);
      setFeedback("课堂状态已同步。");
    } catch (error) {
      if (error instanceof Error && error.message.includes("409")) {
        await refreshAfterConflict();
        setFeedback("课堂状态已更新，请刷新课堂快照");
      } else {
        setFeedback("课堂操作失败，请稍后重试。");
      }
    } finally {
      setPending(null);
    }
  }

  return (
    <section aria-label="课堂指挥台" style={panelStyle}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
        <div>
          <h2 style={headingStyle}>课堂指挥台</h2>
          <p style={mutedStyle}>{localSnapshot.session.status === "live" ? "课堂进行中" : "课堂尚未开始"}</p>
        </div>
        {!localSnapshot.viewer.canControlStages ? <span style={badgeStyle}>助教只读模式</span> : null}
      </div>
      {stage ? (
        <div style={{ marginTop: 16 }}>
          <strong style={{ color: "#fff", fontSize: 18 }}>{stage.title}</strong>
          <p style={mutedStyle}>{stage.status === "paused" ? "已暂停" : stage.status === "running" ? `剩余 ${formatRemaining(remaining)}` : stage.status}</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
            <ControlButton label="开始" onClick={() => void runAction("start")} disabled={Boolean(pending) || !localSnapshot.viewer.canControlStages || stage.status !== "draft"} />
            <ControlButton label="暂停" onClick={() => void runAction("pause")} disabled={Boolean(pending) || !localSnapshot.viewer.canControlStages || stage.status !== "running"} />
            <ControlButton label="延长 5 分钟" onClick={() => void runAction("extend")} disabled={Boolean(pending) || !localSnapshot.viewer.canControlStages || stage.status !== "running"} />
            <ControlButton label="完成" onClick={() => void runAction("complete")} disabled={Boolean(pending) || !localSnapshot.viewer.canControlStages || stage.status === "completed"} />
            <ControlButton label="解锁下一阶段" onClick={() => void runAction("unlock-next")} disabled={Boolean(pending) || !localSnapshot.viewer.canControlStages} />
          </div>
        </div>
      ) : <p style={mutedStyle}>当前没有活动阶段。</p>}
      {feedback ? <p role="status" style={{ ...mutedStyle, color: feedback.includes("失败") || feedback.includes("更新") ? "#fbbf24" : "#86efac" }}>{feedback}</p> : null}
    </section>
  );
}

function ControlButton({ label, onClick, disabled }: { label: string; onClick: () => void; disabled: boolean }) {
  return <button type="button" onClick={onClick} disabled={disabled} style={buttonStyle}>{label}</button>;
}

function formatRemaining(value: number | null) {
  if (value === null) return "--:--";
  return `${Math.floor(value / 60).toString().padStart(2, "0")}:${(value % 60).toString().padStart(2, "0")}`;
}

const panelStyle = { marginTop: 24, padding: 20, borderRadius: 14, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" };
const headingStyle = { margin: 0, color: "#fff", fontSize: 20 };
const mutedStyle = { margin: "6px 0 0", color: "rgba(255,255,255,0.58)", fontSize: 13 };
const badgeStyle = { color: "#fbbf24", background: "rgba(251,191,36,0.12)", borderRadius: 999, padding: "4px 8px", fontSize: 12 };
const buttonStyle = { padding: "8px 12px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.16)", background: "rgba(255,255,255,0.08)", color: "#fff", cursor: "pointer" };
