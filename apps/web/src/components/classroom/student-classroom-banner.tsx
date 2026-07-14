"use client";

import { useEffect, useMemo, useState } from "react";
import type { ClassroomSnapshot, HelpRequestCategory } from "contracts";
import { createHelpRequest, getActiveClassroomSafe } from "../../lib/api-client";
import { createClassroomSocket, type ClassroomConnectionState } from "./classroom-socket";

export function StudentClassroomBanner({
  snapshot,
  token,
  studentId
}: {
  snapshot: ClassroomSnapshot;
  token: string;
  studentId: string;
}) {
  const [localSnapshot, setLocalSnapshot] = useState(snapshot);
  const [showForm, setShowForm] = useState(false);
  const [category, setCategory] = useState<HelpRequestCategory>("question");
  const [message, setMessage] = useState("");
  const [feedback, setFeedback] = useState("");
  const [connection, setConnection] = useState<ClassroomConnectionState>("disconnected");
  const [tick, setTick] = useState(0);

  useEffect(() => setLocalSnapshot(snapshot), [snapshot]);

  useEffect(() => {
    if (process.env.NODE_ENV === "test" || !localSnapshot.session.id) return;
    const socket = createClassroomSocket({
      token,
      sessionId: localSnapshot.session.id,
      initialVersion: localSnapshot.session.version,
      onConnectionState: setConnection,
      onStageUpdate: (payload) => setLocalSnapshot((current) => ({
        ...current,
        session: {
          ...current.session,
          status: payload.status ?? current.session.status,
          version: payload.version,
          currentStageId: payload.currentStage?.id ?? null
        },
        currentStage: payload.currentStage === undefined ? current.currentStage : payload.currentStage,
        serverNow: payload.serverNow
      })),
      onHelpUpdate: (payload) => setLocalSnapshot((current) => ({
        ...current,
        session: { ...current.session, version: payload.version },
        serverNow: payload.serverNow,
        helpRequests: [
          ...current.helpRequests.filter((item) => item.id !== payload.helpRequest.id),
          payload.helpRequest
        ]
      }))
    });
    return socket.disconnect;
  }, [localSnapshot.session.id, token]);

  // REST remains the source-of-truth fallback when the socket is offline.
  useEffect(() => {
    if (process.env.NODE_ENV === "test" || !localSnapshot.session.id) return;
    const interval = window.setInterval(async () => {
      const result = await getActiveClassroomSafe(token);
      if (!result.degraded) setLocalSnapshot(result.data);
    }, connection === "connected" ? 5000 : 3000);
    return () => window.clearInterval(interval);
  }, [connection, localSnapshot.session.id, token]);

  useEffect(() => {
    const timer = window.setInterval(() => setTick((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const stage = localSnapshot.currentStage;
  const remaining = useMemo(() => {
    if (!stage) return null;
    if (stage.status !== "running" || !stage.startedAt) return stage.remainingSeconds ?? null;
    const elapsed = Math.max(0, Math.floor((Date.now() - new Date(stage.startedAt).getTime()) / 1000));
    return Math.max(0, (stage.remainingSeconds ?? stage.durationSeconds + stage.extensionSeconds) - elapsed);
  }, [stage, tick]);
  const isExpired = stage?.status === "running" && remaining === 0;

  const studentHelpRequests = localSnapshot.helpRequests
    .filter((request) => request.studentId === studentId)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  const latestHelp = studentHelpRequests[0];
  const activeHelp = studentHelpRequests.find(
    (request) => request.status === "open" || request.status === "claimed"
  );

  async function submitHelp(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!localSnapshot.session.id || !message.trim()) return;
    setFeedback("");
    try {
      const created = await createHelpRequest({ sessionId: localSnapshot.session.id, category, message: message.trim() }, token);
      setLocalSnapshot((current) => ({ ...current, helpRequests: [...current.helpRequests, created] }));
      setMessage("");
      setShowForm(false);
      setFeedback("求助已提交");
    } catch {
      setFeedback("求助提交失败，请稍后重试。");
    }
  }

  if (!localSnapshot.session.id) {
    return <section aria-label="学生课堂状态" style={panelStyle}><span>课堂数据暂不可达，当前显示安全空态。</span></section>;
  }

  return (
    <section aria-label="学生课堂状态" style={panelStyle}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div style={{ minWidth: 0 }}>
          <span style={dayBadgeStyle}>DAY {localSnapshot.session.dayId.replace(/^day-/, "")}</span>
          <strong style={stageTitleStyle}>{stage?.title ?? "等待课堂阶段"}</strong>
          {stage?.description ? <span style={stageDescriptionStyle}>{stage.description}</span> : null}
        </div>
        <span aria-label="课堂连接状态" style={{ ...connectionBadgeStyle, color: connection === "connected" ? "#8ce7d5" : "#ffd789", borderColor: connection === "connected" ? "rgba(80,214,186,0.36)" : "rgba(248,189,88,0.36)" }}>
          <span aria-hidden="true">●</span>
          {connection === "connected" ? "实时已连接" : connection === "connecting" ? "连接中" : "轮询降级"}
        </span>
      </div>
      <div style={countdownStyle}>
        {stage?.status === "running" ? (isExpired ? "时间到" : `剩余 ${formatRemaining(remaining)}`) : stage?.status === "paused" ? "已暂停" : stage ? "尚未开始" : "当前没有活动阶段"}
      </div>
      {latestHelp ? <p role="status" style={{ color: latestHelp.status === "resolved" ? "#86efac" : "#fbbf24", margin: "8px 0 0" }}>
        求助状态：{latestHelp.status === "resolved" ? `已解决${latestHelp.resolutionNote ? `（${latestHelp.resolutionNote}）` : ""}` : latestHelp.status === "claimed" ? "老师处理中" : latestHelp.status === "open" ? "等待老师回应" : "已取消"}
      </p> : activeHelp ? <p role="status" style={{ color: "#fbbf24", margin: "8px 0 0" }}>求助状态：{activeHelp.status === "claimed" ? "老师处理中" : "等待老师回应"}</p> : null}
      {feedback ? <p role="status" style={{ color: feedback.includes("失败") ? "#fca5a5" : "#86efac", margin: "8px 0 0" }}>{feedback}</p> : null}
      <button type="button" aria-expanded={showForm} onClick={() => setShowForm((value) => !value)} style={buttonStyle}>{showForm ? "收起求助" : "举手求助"}</button>
      {showForm ? (
        <form onSubmit={submitHelp} style={helpFormStyle}>
          <label>求助类型<select aria-label="求助类型" value={category} onChange={(event) => setCategory(event.target.value as HelpRequestCategory)} style={inputStyle}><option value="question">问题</option><option value="blocked">卡住了</option><option value="environment">环境问题</option><option value="review">需要评审</option><option value="other">其他</option></select></label>
          <label>问题描述<textarea aria-label="问题描述" value={message} onChange={(event) => setMessage(event.target.value)} required rows={3} style={inputStyle} /></label>
          <button type="submit" style={buttonStyle} disabled={!message.trim()}>提交求助</button>
        </form>
      ) : null}
    </section>
  );
}

function formatRemaining(value: number | null) {
  if (value === null) return "--:--";
  return `${Math.floor(value / 60).toString().padStart(2, "0")}:${(value % 60).toString().padStart(2, "0")}`;
}

const panelStyle: React.CSSProperties = { position: "relative", zIndex: 20, margin: "10px auto 0", width: "min(920px, calc(100% - 24px))", padding: "14px 16px", borderRadius: 8, border: "1px solid rgba(150,178,221,0.28)", borderTop: "3px solid #64b7ff", background: "linear-gradient(145deg, rgba(13,24,48,0.94), rgba(7,13,28,0.94))", color: "#fff", boxShadow: "0 4px 0 rgba(3,6,14,0.5), 0 14px 28px rgba(0,0,0,0.2)" };
const dayBadgeStyle: React.CSSProperties = { display: "inline-flex", marginRight: 9, padding: "3px 6px", border: "1px solid rgba(246,200,95,0.44)", borderRadius: 4, background: "rgba(246,200,95,0.08)", color: "#ffe5a0", fontFamily: "var(--font-pixel)", fontSize: 10, fontWeight: 900 };
const stageTitleStyle: React.CSSProperties = { color: "#f5f7ff", fontFamily: "var(--font-pixel)", fontSize: 14 };
const stageDescriptionStyle: React.CSSProperties = { display: "block", marginTop: 5, color: "#8998b5", fontSize: 12 };
const connectionBadgeStyle: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 5, padding: "4px 8px", border: "1px solid", borderRadius: 999, background: "rgba(5,11,24,0.34)", fontSize: 10, fontWeight: 800 };
const countdownStyle: React.CSSProperties = { display: "inline-flex", marginTop: 10, padding: "5px 8px", border: "1px solid rgba(118,146,255,0.28)", borderRadius: 4, background: "rgba(118,146,255,0.08)", color: "#dce4ff", fontFamily: "var(--font-pixel)", fontSize: 12, fontWeight: 800 };
const buttonStyle: React.CSSProperties = { minHeight: 36, marginTop: 10, border: "1px solid rgba(80,214,186,0.44)", borderRadius: 5, padding: "7px 12px", background: "rgba(80,214,186,0.13)", color: "#d9fff7", cursor: "pointer", fontWeight: 800, boxShadow: "0 2px 0 rgba(3,6,14,0.42)" };
const helpFormStyle: React.CSSProperties = { display: "grid", gap: 10, maxWidth: 560, marginTop: 12, padding: 13, border: "1px solid rgba(150,178,221,0.2)", borderRadius: 6, background: "rgba(5,11,24,0.34)", color: "#b9c5da", fontSize: 12 };
const inputStyle: React.CSSProperties = { display: "block", width: "100%", marginTop: 5, padding: "8px 9px", border: "1px solid rgba(150,178,221,0.28)", borderRadius: 5, background: "rgba(5,11,24,0.72)", color: "#fff" };
