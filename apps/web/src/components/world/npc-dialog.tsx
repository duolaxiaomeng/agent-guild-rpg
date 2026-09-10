"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  fetchNpcConversationSafe,
} from "../../lib/api-client";

export type NpcDialogProps = {
  /** NPC identifier matching zone-config.ts and backend personas */
  npcId: string;
  /** Display name from zone-config (used as immediate header) */
  npcName: string;
  /** Static tooltip text from zone-config (used as fallback) */
  fallbackText: string;
  /** Optional student ID for memory personalization */
  studentId?: string;
  /** Called when the dialog is closed */
  onClose: () => void;
};

type HistoryEntry = { role: "npc" | "student"; text: string };

export function NpcDialog({
  npcId,
  npcName,
  fallbackText,
  studentId,
  onClose,
}: NpcDialogProps) {
  const [loading, setLoading] = useState(true);
  const [degraded, setDegraded] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  /** Fetch the initial greeting when the dialog opens. */
  const loadGreeting = useCallback(async () => {
    setLoading(true);
    try {
      const result = await fetchNpcConversationSafe(npcId, studentId);
      const data = result.data;
      const isDegraded = result.degraded || data.degraded;
      const text =
        data.reply || (isDegraded ? fallbackText : "...");
      setDegraded(isDegraded);
      setHistory([{ role: "npc", text }]);
    } catch {
      setDegraded(true);
      setHistory([{ role: "npc", text: fallbackText }]);
    } finally {
      setLoading(false);
    }
  }, [npcId, studentId, fallbackText]);

  useEffect(() => {
    void loadGreeting();
  }, [loadGreeting]);

  // H-014: Focus the input when the dialog opens
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  /** Send a user message and fetch the NPC reply. */
  const handleSend = useCallback(async () => {
    const msg = inputValue.trim();
    if (!msg || loading) return;

    setInputValue("");
    setHistory((prev) => [...prev, { role: "student", text: msg }]);
    setLoading(true);

    try {
      const result = await fetchNpcConversationSafe(
        npcId,
        studentId,
        msg,
      );
      const data = result.data;
      const text = data.reply || fallbackText;
      setDegraded(result.degraded || data.degraded);
      setHistory((prev) => [...prev, { role: "npc", text }]);
    } catch {
      setHistory((prev) => [
        ...prev,
        { role: "npc", text: fallbackText },
      ]);
      setDegraded(true);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  }, [npcId, studentId, inputValue, loading, fallbackText]);

  /** Close on Escape key + focus trap. */
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      // H-014: Simple focus trap — keep Tab within the dialog
      if (e.key === "Tab" && dialogRef.current) {
        const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
          'button, input, [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label={`与${npcName}对话`}
      className="npc-dialog-panel"
      style={{
        position: "absolute",
        bottom: 80,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 20,
        width: "min(480px, calc(100vw - 24px))",
        background: "linear-gradient(145deg, rgba(16,34,62,.98), rgba(6,13,29,.98))",
        border: "1px solid rgba(125,211,252,.42)",
        borderRadius: "6px",
        padding: 0,
        color: "#fff",
        boxShadow: "0 7px 0 rgba(2,6,23,.72), 0 28px 70px rgba(0,0,0,.5), inset 0 1px 0 rgba(255,255,255,.06)",
        backdropFilter: "blur(8px)",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "13px 15px",
          borderBottom: "1px solid rgba(125,211,252,.18)",
          background: "rgba(2,6,23,.24)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: 32,
              height: 32,
              borderRadius: "3px",
              background: "rgba(14, 116, 144, 0.34)",
              border: "1px solid rgba(125,211,252,.28)",
              boxShadow: "0 3px 0 rgba(2,6,23,.42)",
              fontSize: 18,
            }}
          >
            🧑‍💼
          </span>
          <div>
            <span style={{ display: "block", color: "#7dd3fc", fontSize: 8, fontWeight: 800, letterSpacing: ".16em" }}>NPC LINK</span>
            <span style={{ display: "block", marginTop: 2, fontWeight: "bold", fontSize: 15 }}>{npcName}</span>
          </div>
          {degraded && (
            <span
              style={{
                fontSize: 10,
                padding: "2px 6px",
                borderRadius: 3,
                background: "rgba(120,53,15,.42)",
                border: "1px solid rgba(251,191,36,.3)",
                color: "#fde68a",
              }}
            >
              离线模式
            </span>
          )}
        </div>
        <button
          onClick={onClose}
          aria-label="关闭对话"
          className="npc-dialog-close"
          style={{
            background: "rgba(15,23,42,.5)",
            border: "1px solid rgba(148,163,184,.18)",
            borderRadius: 3,
            color: "#94a3b8",
            cursor: "pointer",
            fontSize: 20,
            width: 30,
            height: 30,
            padding: 0,
            lineHeight: 1,
          }}
        >
          ✕
        </button>
      </div>

      {/* Conversation area */}
      <div
        style={{
          maxHeight: "min(260px, 38vh)",
          overflowY: "auto",
          padding: "12px 16px",
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        {history.map((entry, i) => (
          <div
            // F-028: Use content-based key instead of array index
            key={`${entry.role}-${entry.text.slice(0, 20)}-${i}`}
            style={{
              alignSelf:
                entry.role === "student" ? "flex-end" : "flex-start",
              maxWidth: "80%",
              padding: "8px 12px",
              borderRadius: entry.role === "student" ? "6px 6px 2px 6px" : "6px 6px 6px 2px",
              fontSize: 14,
              lineHeight: 1.5,
              background:
                entry.role === "student"
                  ? "linear-gradient(145deg, rgba(14,116,144,.56), rgba(8,47,73,.62))"
                  : "rgba(30,41,59,.72)",
              border: entry.role === "student" ? "1px solid rgba(125,211,252,.26)" : "1px solid rgba(148,163,184,.16)",
              boxShadow: "0 3px 0 rgba(2,6,23,.34)",
            }}
          >
            {entry.text}
          </div>
        ))}
        {loading && (
          <div
            style={{
              alignSelf: "flex-start",
              padding: "8px 12px",
              borderRadius: 5,
              fontSize: 14,
              background: "rgba(30,41,59,.68)",
              color: "#94a3b8",
            }}
          >
            <span style={{ animation: "pulse 1s infinite" }}>思考中...</span>
          </div>
        )}
      </div>

      {/* Input area */}
      <div
        style={{
          display: "flex",
          gap: 8,
          padding: "12px 16px",
          borderTop: "1px solid rgba(125,211,252,.16)",
          background: "rgba(2,6,23,.22)",
        }}
      >
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void handleSend();
          }}
          placeholder="输入消息..."
          disabled={loading}
          aria-label="发送消息给NPC"
          className="npc-dialog-input"
          style={{
            flex: 1,
            padding: "8px 12px",
            borderRadius: 4,
            border: "1px solid rgba(148,163,184,.24)",
            background: "rgba(2,6,23,.58)",
            color: "#fff",
            fontSize: 14,
            outline: "none",
          }}
        />
        <button
          onClick={() => void handleSend()}
          disabled={loading || !inputValue.trim()}
          aria-label="发送消息"
          className="npc-dialog-send"
          style={{
            padding: "8px 16px",
            borderRadius: 4,
            border: "1px solid rgba(186,230,253,.42)",
            background:
              loading || !inputValue.trim()
                ? "rgba(59, 130, 246, 0.3)"
                : "linear-gradient(180deg, #0ea5e9, #0369a1)",
            color: "#fff",
            cursor:
              loading || !inputValue.trim() ? "not-allowed" : "pointer",
            fontSize: 14,
            fontWeight: "bold",
            boxShadow: loading || !inputValue.trim() ? "none" : "0 3px 0 #082f49",
          }}
        >
          发送
        </button>
      </div>
      <style>{`
        .npc-dialog-input:focus { border-color: #38bdf8 !important; box-shadow: 0 0 0 3px rgba(14,165,233,.14); }
        .npc-dialog-close:hover, .npc-dialog-send:hover:not(:disabled) { filter: brightness(1.18); transform: translateY(-1px); }
        .npc-dialog-close:focus-visible, .npc-dialog-send:focus-visible, .npc-dialog-input:focus-visible { outline: 2px solid #7dd3fc; outline-offset: 2px; }
        @media (max-width: 520px) {
          .npc-dialog-panel { bottom: 68px !important; }
        }
      `}</style>
    </div>
  );
}
