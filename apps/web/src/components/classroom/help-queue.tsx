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
    <h2 style={headingStyle}>课堂求助队列</h2>
    {ordered.length === 0 ? <p style={mutedStyle}>暂无学生求助。</p> : <ul style={{ listStyle: "none", margin: "14px 0 0", padding: 0, display: "grid", gap: 10 }}>
      {ordered.map((item) => <li key={item.id} style={itemStyle}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}><strong style={{ color: "#fff" }}>{item.category}</strong><span style={mutedStyle}>{statusLabel(item.status)}</span></div>
        <p style={{ ...mutedStyle, color: "rgba(255,255,255,0.76)" }}>{item.message}</p>
        <p style={mutedStyle}>等待 {waitingLabel(item.createdAt)}</p>
        {canHandleHelp && item.status === "open" ? <button type="button" disabled={pending === item.id} onClick={() => void claim(item)} style={buttonStyle}>认领</button> : null}
        {canHandleHelp && item.status === "claimed" ? <div style={{ display: "flex", gap: 8, alignItems: "center" }}><input aria-label={`处理备注-${item.id}`} value={notes[item.id] ?? ""} onChange={(event) => setNotes((current) => ({ ...current, [item.id]: event.target.value }))} placeholder="处理备注" style={inputStyle} /><button type="button" disabled={pending === item.id} onClick={() => void resolve(item)} style={buttonStyle}>解决</button></div> : null}
      </li>)}
    </ul>}
    {feedback ? <p role="status" style={mutedStyle}>{feedback}</p> : null}
  </section>;
}

function statusLabel(status: HelpRequest["status"]) { return status === "open" ? "待处理" : status === "claimed" ? "处理中" : status === "resolved" ? "已解决" : "已取消"; }
function waitingLabel(createdAt: string) { const seconds = Math.max(0, Math.floor((Date.now() - new Date(createdAt).getTime()) / 1000)); return seconds < 60 ? `${seconds} 秒` : `${Math.floor(seconds / 60)} 分钟`; }
const panelStyle = { marginTop: 24, padding: 20, borderRadius: 14, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" };
const headingStyle = { margin: 0, color: "#fff", fontSize: 20 };
const mutedStyle = { margin: "6px 0 0", color: "rgba(255,255,255,0.58)", fontSize: 13 };
const itemStyle = { padding: 14, borderRadius: 10, background: "rgba(255,255,255,0.04)" };
const buttonStyle = { padding: "7px 12px", borderRadius: 8, border: "1px solid rgba(99,102,241,0.4)", background: "rgba(99,102,241,0.14)", color: "#c7d2fe", cursor: "pointer" };
const inputStyle = { flex: 1, minWidth: 0, padding: "7px 9px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.16)", background: "rgba(0,0,0,0.16)", color: "#fff" };
