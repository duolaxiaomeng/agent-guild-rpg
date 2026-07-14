"use client";

import { useEffect, useMemo, useState } from "react";
import {
  completeClassroomStage,
  endClassroomStage,
  extendClassroomStage,
  getActiveClassroomSafe,
  pauseClassroomStage,
  startClassroomStage,
  unlockNextClassroomStage
} from "../../lib/api-client";
import type { ClassroomSnapshot } from "contracts";

type Action = "start" | "pause" | "extend" | "complete" | "end-early" | "unlock-next";

export function ClassroomControlPanel({ snapshot, token }: { snapshot: ClassroomSnapshot; token: string }) {
  const [localSnapshot, setLocalSnapshot] = useState(snapshot);
  const [pending, setPending] = useState<Action | null>(null);
  const [feedback, setFeedback] = useState("");
  const [tick, setTick] = useState(0);

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
  }, [stage, tick]);
  const isExpired = stage?.status === "running" && remaining === 0;
  const stageTone = stage?.status === "running" ? "#50d6ba" : stage?.status === "paused" ? "#f8bd58" : "#9aafff";

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
                : action === "end-early"
                  ? await endClassroomStage(stage.id, stage.version, token)
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
      <div style={headerStyle}>
        <div>
          <span style={eyebrowStyle}>LIVE CLASSROOM CONTROL</span>
          <h2 style={headingStyle}>课堂指挥台</h2>
          <p style={mutedStyle}>{localSnapshot.session.status === "live" ? "课堂进行中" : "课堂尚未开始"}</p>
        </div>
        <span style={{ ...badgeStyle, color: localSnapshot.viewer.canControlStages ? "#8ce7d5" : "#ffd789", borderColor: localSnapshot.viewer.canControlStages ? "rgba(80,214,186,0.38)" : "rgba(248,189,88,0.38)" }}>
          {localSnapshot.viewer.canControlStages ? "老师控制模式" : "助教只读模式"}
        </span>
      </div>
      {stage ? (
        <div style={{ ...stageCardStyle, borderLeftColor: stageTone }}>
          <div style={stageSummaryStyle}>
            <div>
              <span style={stageLabelStyle}>CURRENT STAGE</span>
              <strong style={stageTitleStyle}>{stage.title}</strong>
            </div>
            <span style={{ ...timerStyle, color: stageTone }}>
              {stage.status === "running" ? formatRemaining(remaining) : stage.status === "paused" ? "PAUSED" : "READY"}
            </span>
          </div>
          <p style={{ ...mutedStyle, color: stageTone }}>{stage.status === "paused" ? "已暂停" : isExpired ? "时间到，可完成当前阶段" : stage.status === "running" ? `剩余 ${formatRemaining(remaining)}` : stage.status}</p>
          <div style={actionGridStyle}>
            <ControlButton label="开始" onClick={() => void runAction("start")} disabled={Boolean(pending) || !localSnapshot.viewer.canControlStages || !["draft", "paused"].includes(stage.status)} />
            <ControlButton label="暂停" onClick={() => void runAction("pause")} disabled={Boolean(pending) || !localSnapshot.viewer.canControlStages || stage.status !== "running" || isExpired} />
            <ControlButton label="延长 5 分钟" onClick={() => void runAction("extend")} disabled={Boolean(pending) || !localSnapshot.viewer.canControlStages || !["running", "paused"].includes(stage.status)} />
            <ControlButton label="完成" onClick={() => void runAction("complete")} disabled={Boolean(pending) || !localSnapshot.viewer.canControlStages || !["running", "paused"].includes(stage.status)} />
            <ControlButton label="提前结束" onClick={() => void runAction("end-early")} disabled={Boolean(pending) || !localSnapshot.viewer.canControlStages || !["running", "paused"].includes(stage.status)} />
            <ControlButton label="解锁下一阶段" onClick={() => void runAction("unlock-next")} disabled={Boolean(pending) || !localSnapshot.viewer.canControlStages || !["completed", "ended_early"].includes(stage.status)} />
          </div>
        </div>
      ) : <p style={emptyStyle}>当前没有活动阶段。</p>}
      {feedback ? <p role="status" style={{ ...feedbackStyle, color: feedback.includes("失败") || feedback.includes("更新") ? "#ffd789" : "#8ce7d5" }}>{feedback}</p> : null}
    </section>
  );
}

function ControlButton({ label, onClick, disabled }: { label: string; onClick: () => void; disabled: boolean }) {
  return <button type="button" onClick={onClick} disabled={disabled} style={{ ...buttonStyle, opacity: disabled ? 0.42 : 1, cursor: disabled ? "not-allowed" : "pointer" }}>{label}</button>;
}

function formatRemaining(value: number | null) {
  if (value === null) return "--:--";
  return `${Math.floor(value / 60).toString().padStart(2, "0")}:${(value % 60).toString().padStart(2, "0")}`;
}

const panelStyle = { marginTop: 24, padding: "clamp(18px, 3vw, 24px)", borderRadius: 12, background: "rgba(12,23,45,0.78)", border: "1px solid rgba(150,178,221,0.2)", boxShadow: "0 5px 0 rgba(3,6,14,0.42)" };
const headerStyle = { display: "flex", justifyContent: "space-between", flexWrap: "wrap" as const, gap: 12, alignItems: "center" };
const eyebrowStyle = { display: "block", color: "#8998b5", fontFamily: "var(--font-pixel)", fontSize: 9, fontWeight: 800, letterSpacing: "0.12em" };
const headingStyle = { margin: "3px 0 0", color: "#fff", fontFamily: "var(--font-pixel)", fontSize: 20 };
const mutedStyle = { margin: "6px 0 0", color: "#8998b5", fontSize: 13 };
const badgeStyle = { padding: "4px 8px", border: "1px solid", borderRadius: 999, background: "rgba(5,11,24,0.28)", fontSize: 11, fontWeight: 800, whiteSpace: "nowrap" as const };
const stageCardStyle = { marginTop: 16, padding: "clamp(15px, 3vw, 20px)", border: "1px solid rgba(150,178,221,0.17)", borderLeft: "4px solid", borderRadius: 7, background: "linear-gradient(145deg, rgba(27,43,76,0.7), rgba(5,11,24,0.28))" };
const stageSummaryStyle = { display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap" as const, gap: 12 };
const stageLabelStyle = { display: "block", marginBottom: 3, color: "#7183a4", fontFamily: "var(--font-pixel)", fontSize: 9, letterSpacing: "0.08em" };
const stageTitleStyle = { display: "block", color: "#fff", fontFamily: "var(--font-pixel)", fontSize: 18 };
const timerStyle = { fontFamily: "var(--font-pixel)", fontSize: 20, fontWeight: 900, letterSpacing: "0.04em" };
const actionGridStyle = { display: "flex", flexWrap: "wrap" as const, gap: 8, marginTop: 14 };
const buttonStyle = { flex: "1 1 126px", minHeight: 38, padding: "8px 12px", borderRadius: 5, border: "1px solid rgba(154,175,255,0.35)", background: "rgba(118,146,255,0.11)", color: "#eef2ff", fontWeight: 800, boxShadow: "0 2px 0 rgba(3,6,14,0.38)" };
const feedbackStyle = { margin: "12px 0 0", fontSize: 12, fontWeight: 800 };
const emptyStyle = { margin: "16px 0 0", padding: 18, border: "1px dashed rgba(150,178,221,0.22)", borderRadius: 6, color: "#8998b5", textAlign: "center" as const };
