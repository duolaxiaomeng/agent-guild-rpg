"use client";

import { CSSProperties, useEffect, useRef, useState } from "react";
import {
  createChatMessage,
  getChatRoom,
  type ChatMessage
} from "../../lib/api-client";
import { toTimeLabel } from "../../lib/format";
import { loadSession } from "../../lib/session";
import { createChatSocket, type ChatConnectionState } from "./chat-socket";

/* ────────────────────────────────────────────
   Styles
   ──────────────────────────────────────────── */

const sectionStyle: CSSProperties = {
  background: "linear-gradient(145deg, rgba(17,34,61,.92), rgba(8,17,35,.94))",
  border: "1px solid rgba(125,211,252,.23)",
  borderRadius: "7px",
  padding: "clamp(18px, 4vw, 24px)",
  display: "flex",
  flexDirection: "column",
  boxShadow: "0 6px 0 rgba(2,6,23,.46), inset 0 1px 0 rgba(255,255,255,.05)",
};

const headingStyle: CSSProperties = {
  fontSize: "16px",
  fontWeight: "800",
  color: "#fff",
  margin: 0,
};

const degradedIndicatorStyle: CSSProperties = {
  fontSize: "12px",
  color: "#fbbf24",
  background: "rgba(251, 191, 36, 0.08)",
  border: "1px solid rgba(251, 191, 36, 0.2)",
  borderRadius: "4px",
  padding: "6px 10px",
  marginBottom: "12px",
};

const messageListStyle: CSSProperties = {
  listStyle: "none",
  padding: 0,
  margin: 0,
  display: "flex",
  flexDirection: "column",
  gap: "13px",
  maxHeight: "400px",
  overflowY: "auto",
  marginBottom: "18px",
  paddingRight: 4,
};

const messageRowSelfStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-end",
};

const messageRowOtherStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-start",
};

const bubbleSelfStyle: CSSProperties = {
  background: "linear-gradient(145deg, rgba(14,116,144,.46), rgba(8,47,73,.52))",
  border: "1px solid rgba(125,211,252,.28)",
  borderRadius: "7px 7px 2px 7px",
  padding: "10px 13px",
  maxWidth: "80%",
  boxShadow: "0 3px 0 rgba(2,36,54,.42)",
};

const bubbleOtherStyle: CSSProperties = {
  background: "rgba(30,41,59,.6)",
  border: "1px solid rgba(148,163,184,.16)",
  borderRadius: "7px 7px 7px 2px",
  padding: "10px 13px",
  maxWidth: "80%",
  boxShadow: "0 3px 0 rgba(2,6,23,.4)",
};

const authorNameStyle: CSSProperties = {
  fontSize: "12px",
  fontWeight: "600",
  color: "#7dd3fc",
  marginBottom: "4px",
};

const messageBodyStyle: CSSProperties = {
  fontSize: "14px",
  color: "#e2e8f0",
  lineHeight: "1.5",
  margin: 0,
  wordBreak: "break-word",
};

const timestampStyle: CSSProperties = {
  fontSize: "11px",
  color: "#64748b",
  marginTop: "4px",
};

const emptyMsgStyle: CSSProperties = {
  fontSize: "14px",
  color: "#64748b",
  fontStyle: "italic",
  padding: "20px 0",
  textAlign: "center",
};

const inputRowStyle: CSSProperties = {
  display: "flex",
  gap: "10px",
  alignItems: "flex-end",
  flexWrap: "wrap",
};

const inputWrapperStyle: CSSProperties = {
  flex: 1,
  minWidth: "min(100%, 220px)",
  display: "flex",
  flexDirection: "column",
};

const inputLabelStyle: CSSProperties = {
  fontSize: "12px",
  color: "#94a3b8",
  marginBottom: "6px",
};

const inputStyle: CSSProperties = {
  flex: 1,
  minHeight: 42,
  padding: "10px 13px",
  fontSize: "14px",
  background: "rgba(2,6,23,.48)",
  border: "1px solid rgba(148,163,184,.24)",
  borderRadius: "4px",
  color: "#fff",
  outline: "none",
  transition: "border-color 0.2s, box-shadow 0.2s",
};

const sendButtonStyle: CSSProperties = {
  minHeight: 42,
  padding: "10px 18px",
  fontSize: "14px",
  fontWeight: "600",
  background: "linear-gradient(180deg, #0ea5e9 0%, #0369a1 100%)",
  border: "1px solid rgba(186,230,253,.55)",
  borderRadius: "4px",
  color: "#fff",
  cursor: "pointer",
  transition: "transform 0.1s, box-shadow 0.2s, opacity 0.2s",
  boxShadow: "0 4px 0 #082f49, 0 10px 20px rgba(14,165,233,.18)",
  whiteSpace: "nowrap",
};

const sendButtonDisabledStyle: CSSProperties = {
  ...sendButtonStyle,
  opacity: 0.6,
  cursor: "not-allowed",
  boxShadow: "none",
};

const feedbackTextStyle: CSSProperties = {
  fontSize: "13px",
  color: "#bae6fd",
  marginTop: "8px",
};

/* ────────────────────────────────────────────
   Component
   ──────────────────────────────────────────── */

type RoomMessagesProps = {
  roomId: string;
  /** F-016: currentUserId is now required (no default). */
  currentUserId: string;
  initialMessages: ChatMessage[];
  readOnly?: boolean;
};

/** H-007: Number of consecutive polling failures before showing the degraded indicator. */
const DEGRADED_THRESHOLD = 3;
const CONNECTED_POLL_INTERVAL_MS = 60_000;
const FALLBACK_POLL_INTERVAL_MS = 10_000;

function mergeMessages(existing: ChatMessage[], incoming: ChatMessage[]) {
  const byId = new Map(existing.map((message) => [message.id, message]));
  for (const message of incoming) {
    byId.set(message.id, message);
  }
  return [...byId.values()].sort((a, b) => {
    if (a.createdAt < b.createdAt) return -1;
    if (a.createdAt > b.createdAt) return 1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

export function RoomMessages({
  roomId,
  currentUserId,
  initialMessages,
  readOnly = false
}: RoomMessagesProps) {
  const [currentMessages, setCurrentMessages] = useState(initialMessages);
  const [messageBody, setMessageBody] = useState("");
  const [messageFeedback, setMessageFeedback] = useState<string | null>(null);
  const [isMessageSending, setIsMessageSending] = useState(false);
  // H-007: Track consecutive polling failures for the degraded indicator.
  const [pollFailCount, setPollFailCount] = useState(0);
  const [connectionState, setConnectionState] =
    useState<ChatConnectionState>("connecting");
  const isDegraded =
    connectionState === "disconnected" || pollFailCount >= DEGRADED_THRESHOLD;
  const connectionLabel =
    connectionState === "connected"
      ? "实时同步"
      : connectionState === "connecting"
        ? "正在连接"
        : "轮询同步";

  // F-025: Store the feedback setTimeout timer in a ref for proper cleanup.
  const feedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // F-025: Clear any pending feedback timer on unmount.
  useEffect(() => {
    return () => {
      if (feedbackTimerRef.current) {
        clearTimeout(feedbackTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const session = loadSession();
    const connection = createChatSocket({
      roomId,
      token: session?.token || undefined,
      onConnectionState: setConnectionState,
      onMessage(message) {
        setCurrentMessages((existing) => mergeMessages(existing, [message]));
      }
    });

    return () => connection.disconnect();
  }, [roomId]);

  useEffect(() => {
    let disposed = false;
    const poll = async () => {
      const session = loadSession();
      if (!session) {
        return;
      }
      try {
        const room = await getChatRoom(roomId, session.token);
        if (!disposed) {
          // H-007: Reset failure count on successful poll.
          setPollFailCount(0);
          setCurrentMessages((prev) => mergeMessages(prev, room.messages));
        }
      } catch {
        // H-007: Increment failure count instead of silently swallowing.
        if (!disposed) {
          setPollFailCount((prev) => prev + 1);
        }
      }
    };
    void poll(); // 立即执行首次
    const timer = setInterval(
      poll,
      connectionState === "connected"
        ? CONNECTED_POLL_INTERVAL_MS
        : FALLBACK_POLL_INTERVAL_MS
    );
    return () => {
      disposed = true;
      clearInterval(timer);
    };
  }, [connectionState, roomId]);

  async function handleSendMessage() {
    const session = loadSession();
    const nextBody = messageBody.trim();

    if (!nextBody) {
      setMessageFeedback("请输入消息内容。");
      return;
    }

    if (!session) {
      setMessageFeedback("当前登录已失效，请重新登录。");
      return;
    }

    setIsMessageSending(true);
    setMessageFeedback("正在发送消息...");

    try {
      // A-012: API DTO now uses 'content' instead of 'body'.
      // The api-client.ts type still expects 'body', so we cast.
      const createdMessage = await createChatMessage(
        { roomId, content: nextBody } as unknown as Parameters<
          typeof createChatMessage
        >[0],
        session.token
      );

      setCurrentMessages((existingMessages) =>
        mergeMessages(existingMessages, [createdMessage])
      );
      setMessageBody("");
      setMessageFeedback("消息已发送。");

      // F-025: Clear previous timer and set a new one.
      if (feedbackTimerRef.current) {
        clearTimeout(feedbackTimerRef.current);
      }
      feedbackTimerRef.current = setTimeout(() => setMessageFeedback(null), 3000);
    } catch {
      setMessageFeedback("消息发送失败，请稍后重试。");
    } finally {
      setIsMessageSending(false);
    }
  }

  return (
    <section className="room-message-panel" style={sectionStyle}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 16 }}>
        <div>
          <span style={{ display: "block", marginBottom: 5, color: "#7dd3fc", fontSize: 9, fontWeight: 800, letterSpacing: ".18em" }}>MESSAGE STREAM</span>
          <h2 style={headingStyle}>房间消息</h2>
        </div>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "5px 8px", color: isDegraded ? "#fde68a" : "#86efac", background: "rgba(2,6,23,.34)", border: "1px solid rgba(148,163,184,.16)", borderRadius: 3, fontSize: 10, fontWeight: 700 }}>
          <span aria-hidden="true" style={{ width: 6, height: 6, background: isDegraded ? "#fbbf24" : "#4ade80", boxShadow: `0 0 8px ${isDegraded ? "#fbbf24" : "#4ade80"}` }} />
          {connectionLabel}
        </span>
      </div>
      {/* H-007: Degraded indicator for polling failures */}
      {isDegraded ? (
        <div style={degradedIndicatorStyle}>
          实时连接已断开，显示数据可能延迟
        </div>
      ) : null}
      {currentMessages.length > 0 ? (
        <ul className="room-message-list" style={messageListStyle}>
          {currentMessages.map((message) => {
            const isSelf = message.authorId === currentUserId;
            return (
              <li
                key={message.id}
                style={isSelf ? messageRowSelfStyle : messageRowOtherStyle}
              >
                <div style={isSelf ? bubbleSelfStyle : bubbleOtherStyle}>
                  <div style={authorNameStyle}>{message.authorName}</div>
                  <p style={messageBodyStyle}>{message.body}</p>
                </div>
                <span style={timestampStyle}>{toTimeLabel(message.createdAt)}</span>
              </li>
            );
          })}
        </ul>
      ) : (
        <p style={emptyMsgStyle}>当前还没有房间消息。</p>
      )}
      {readOnly ? null : (
        <>
          <div className="room-message-composer" style={inputRowStyle}>
            <div style={inputWrapperStyle}>
              <label htmlFor="message-input" style={inputLabelStyle}>消息内容</label>
              <input
                id="message-input"
                value={messageBody}
                onChange={(event) => setMessageBody(event.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void handleSendMessage();
                  }
                }}
                placeholder="输入消息..."
                className="room-message-input"
                style={inputStyle}
              />
            </div>
            <button
              type="button"
              onClick={() => void handleSendMessage()}
              disabled={isMessageSending}
              className="room-message-send"
              style={isMessageSending ? sendButtonDisabledStyle : sendButtonStyle}
            >
              {isMessageSending ? "发送中..." : "发送消息"}
            </button>
          </div>
          {messageFeedback ? <p role="status" style={feedbackTextStyle}>{messageFeedback}</p> : null}
        </>
      )}
      <style>{`
        .room-message-list { scrollbar-width: thin; scrollbar-color: rgba(56,189,248,.4) rgba(2,6,23,.2); }
        .room-message-input:focus { border-color: #38bdf8 !important; box-shadow: 0 0 0 3px rgba(14,165,233,.14); }
        .room-message-send:hover:not(:disabled) { filter: brightness(1.15); transform: translateY(-1px); }
        .room-message-send:active:not(:disabled) { transform: translateY(2px); box-shadow: 0 2px 0 #082f49 !important; }
        .room-message-send:focus-visible { outline: 2px solid #bae6fd; outline-offset: 3px; }
        @media (max-width: 520px) {
          .room-message-composer > * { width: 100%; }
        }
      `}</style>
    </section>
  );
}
