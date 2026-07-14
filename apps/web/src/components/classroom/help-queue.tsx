"use client";

import { useMemo, useState } from "react";
import { claimHelpRequest, resolveHelpRequest } from "../../lib/api-client";
import type { HelpRequest } from "contracts";

export function HelpQueue({ sessionId, requests, token, canHandleHelp }: { sessionId: string; requests: HelpRequest[]; token: string; canHandleHelp: boolean }) {
  const [items, setItems] = useState(requests);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [pending, setPending] = useState<string | null>(null);
  const [feedback, setFeedback] = useState("");
  const ordered = useMemo(() => [...items].sort((a, b) => Number(b.status === "open") - Number(a.status === "open") || a.createdAt.localeCompare(b.createdAt)), [items]);

  async function claim(item: HelpRequest) {
    setPending(item.id);
    try {
      const updated = await claimHelpRequest(item.id, item.version, token);
      setItems((current) => current.map((entry) => entry.id === item.id ? updated : entry));
      setFeedback("求助已认领。");
    } catch {
      setFeedback("认领失败，请刷新队列重试。");
    } finally { setPending(null); }
  }

  async function resolve(item: HelpRequest) {
    const note = notes[item.id]?.trim();
    if (!note) { setFeedback("请填写处理备注后再解决。"); return; }
    setPending(item.id);
    try {
      const updated = await resolveHelpRequest(item.id, note, token, item.version);
      setItems((current) => current.map((entry) => entry.id === item.id ? updated : entry));
      setFeedback("求助已解决。");
    } catch { setFeedback("解决失败，请刷新队列重试。"); }
    finally { setPending(null); }
  }

  return <section aria-label="课堂求助队列" style={panelStyle}>
    <div style={headerStyle}><div><span style={eyebrowStyle}>STUDENT HELP DESK</span><h2 style={headingStyle}>课堂求助队列</h2></div><span style={countBadgeStyle}>{ordered.filter((item) => item.status === "open").length} 项待认领</span></div>
    {ordered.length === 0 ? <p style={emptyStyle}>暂无学生求助，课堂状态良好。</p> : <ul style={listStyle}>
      {ordered.map((item) => <li key={item.id} style={{ ...itemStyle, borderLeftColor: statusColor(item.status) }}>
        <div style={itemHeaderStyle}><strong style={categoryStyle}>{categoryLabel(item.category)}</strong><span style={{ ...statusStyle, color: statusColor(item.status), borderColor: `${statusColor(item.status)}55` }}><span aria-hidden="true">●</span>{statusLabel(item.status)}</span></div>
        <p style={messageStyle}>{item.message}</p>
        <p style={mutedStyle}>已等待 {waitingLabel(item.createdAt)}</p>
        {canHandleHelp && item.status === "open" ? <button type="button" disabled={pending === item.id} onClick={() => void claim(item)} style={buttonStyle}>认领</button> : null}
        {canHandleHelp && item.status === "claimed" ? <div style={resolveRowStyle}><input aria-label={`处理备注-${item.id}`} value={notes[item.id] ?? ""} onChange={(event) => setNotes((current) => ({ ...current, [item.id]: event.target.value }))} placeholder="填写处理备注" style={inputStyle} /><button type="button" disabled={pending === item.id} onClick={() => void resolve(item)} style={buttonStyle}>解决</button></div> : null}
      </li>)}
    </ul>}
    {feedback ? <p role="status" style={{ ...feedbackStyle, color: feedback.includes("失败") || feedback.includes("填写") ? "#ffd789" : "#8ce7d5" }}>{feedback}</p> : null}
  </section>;
}

function statusLabel(status: HelpRequest["status"]) { return status === "open" ? "待处理" : status === "claimed" ? "处理中" : status === "resolved" ? "已解决" : "已取消"; }
function statusColor(status: HelpRequest["status"]) { return status === "open" ? "#f8bd58" : status === "claimed" ? "#64b7ff" : status === "resolved" ? "#50d6ba" : "#8998b5"; }
function categoryLabel(category: HelpRequest["category"]) { return category === "question" ? "课堂问题" : category === "blocked" ? "进度受阻" : category === "environment" ? "环境问题" : category === "review" ? "请求评审" : "其他求助"; }
function waitingLabel(createdAt: string) { const seconds = Math.max(0, Math.floor((Date.now() - new Date(createdAt).getTime()) / 1000)); return seconds < 60 ? `${seconds} 秒` : `${Math.floor(seconds / 60)} 分钟`; }
const panelStyle = { marginTop: 24, padding: "clamp(18px, 3vw, 24px)", borderRadius: 12, background: "rgba(12,23,45,0.78)", border: "1px solid rgba(150,178,221,0.2)", boxShadow: "0 5px 0 rgba(3,6,14,0.42)" };
const headerStyle = { display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap" as const, gap: 12 };
const eyebrowStyle = { display: "block", color: "#8998b5", fontFamily: "var(--font-pixel)", fontSize: 9, fontWeight: 800, letterSpacing: "0.12em" };
const headingStyle = { margin: "3px 0 0", color: "#fff", fontFamily: "var(--font-pixel)", fontSize: 20 };
const countBadgeStyle = { padding: "4px 9px", border: "1px solid rgba(248,189,88,0.36)", borderRadius: 999, background: "rgba(248,189,88,0.08)", color: "#ffd789", fontSize: 11, fontWeight: 800 };
const mutedStyle = { margin: "6px 0 0", color: "#8998b5", fontSize: 12 };
const listStyle = { listStyle: "none", margin: "16px 0 0", padding: 0, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 300px), 1fr))", gap: 10 };
const itemStyle = { padding: 15, border: "1px solid rgba(150,178,221,0.17)", borderLeft: "4px solid", borderRadius: 7, background: "linear-gradient(145deg, rgba(27,43,76,0.68), rgba(5,11,24,0.24))" };
const itemHeaderStyle = { display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" };
const categoryStyle = { color: "#fff", fontFamily: "var(--font-pixel)", fontSize: 13 };
const statusStyle = { display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 7px", border: "1px solid", borderRadius: 999, fontSize: 10, fontWeight: 800 };
const messageStyle = { minHeight: 40, margin: "11px 0 0", color: "#c5cfe1", fontSize: 13, lineHeight: 1.55 };
const resolveRowStyle = { display: "flex", flexWrap: "wrap" as const, gap: 8, alignItems: "center", marginTop: 10 };
const buttonStyle = { minHeight: 34, marginTop: 10, padding: "7px 12px", borderRadius: 5, border: "1px solid rgba(154,175,255,0.4)", background: "rgba(118,146,255,0.13)", color: "#dce4ff", cursor: "pointer", fontWeight: 800, boxShadow: "0 2px 0 rgba(3,6,14,0.38)" };
const inputStyle = { flex: "1 1 180px", minWidth: 0, minHeight: 36, padding: "7px 9px", borderRadius: 5, border: "1px solid rgba(150,178,221,0.24)", background: "rgba(5,11,24,0.52)", color: "#fff" };
const feedbackStyle = { margin: "12px 0 0", fontSize: 12, fontWeight: 800 };
const emptyStyle = { margin: "16px 0 0", padding: 20, border: "1px dashed rgba(150,178,221,0.22)", borderRadius: 6, color: "#8998b5", textAlign: "center" as const };
