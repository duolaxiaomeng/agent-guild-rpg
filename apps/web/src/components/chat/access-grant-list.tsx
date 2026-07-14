"use client";

import { CSSProperties, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  createRoomAccessGrant,
  revokeRoomAccessGrant,
  type RoomAccessGrant
} from "../../lib/api-client";
import { loadSession } from "../../lib/session";

/* ────────────────────────────────────────────
   Styles
   ──────────────────────────────────────────── */

const sectionStyle: CSSProperties = {
  background: "linear-gradient(145deg, rgba(17,34,61,.92), rgba(8,17,35,.94))",
  border: "1px solid rgba(167,139,250,.25)",
  borderRadius: "7px",
  padding: "clamp(18px, 4vw, 24px)",
  boxShadow: "0 6px 0 rgba(2,6,23,.46), inset 0 1px 0 rgba(255,255,255,.05)",
};

const headingStyle: CSSProperties = {
  fontSize: "16px",
  fontWeight: "800",
  color: "#fff",
  margin: 0,
};

const formRowStyle: CSSProperties = {
  display: "flex",
  gap: "10px",
  alignItems: "flex-end",
  margin: "18px 0 16px",
  flexWrap: "wrap",
};

const inputWrapperStyle: CSSProperties = {
  flex: 1,
  minWidth: "min(100%, 220px)",
  display: "flex",
  flexDirection: "column",
};

const labelStyle: CSSProperties = {
  fontSize: "12px",
  color: "#94a3b8",
  marginBottom: "6px",
};

const inputStyle: CSSProperties = {
  minHeight: 42,
  padding: "10px 13px",
  fontSize: "14px",
  background: "rgba(2, 6, 23, 0.48)",
  border: "1px solid rgba(148, 163, 184, 0.24)",
  borderRadius: "4px",
  color: "#fff",
  outline: "none",
  transition: "border-color 0.2s, box-shadow 0.2s",
};

const createButtonStyle: CSSProperties = {
  minHeight: 42,
  padding: "10px 18px",
  fontSize: "14px",
  fontWeight: "600",
  background: "linear-gradient(180deg, #8b5cf6 0%, #6d28d9 100%)",
  border: "1px solid rgba(221,214,254,.5)",
  borderRadius: "4px",
  color: "#fff",
  cursor: "pointer",
  transition: "transform 0.1s, box-shadow 0.2s, opacity 0.2s",
  boxShadow: "0 4px 0 #3b0764, 0 10px 20px rgba(109,40,217,.18)",
  whiteSpace: "nowrap",
};

const createButtonDisabledStyle: CSSProperties = {
  ...createButtonStyle,
  opacity: 0.6,
  cursor: "not-allowed",
  boxShadow: "none",
};

const feedbackTextStyle: CSSProperties = {
  fontSize: "13px",
  color: "#ddd6fe",
  marginBottom: "16px",
};

const grantListStyle: CSSProperties = {
  listStyle: "none",
  padding: 0,
  margin: 0,
  display: "flex",
  flexDirection: "column",
  gap: "10px",
};

const emptyGrantStyle: CSSProperties = {
  fontSize: "14px",
  color: "#64748b",
  fontStyle: "italic",
  padding: "16px 0",
  textAlign: "center",
};

function getGrantItemStyle(status: RoomAccessGrant["status"]): CSSProperties {
  const borderColor =
    status === "approved"
      ? "rgba(74, 222, 128, 0.4)"
      : status === "revoked"
        ? "rgba(248, 113, 113, 0.4)"
        : "rgba(255, 255, 255, 0.15)";
  return {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "12px",
    flexWrap: "wrap",
    background: "rgba(2, 6, 23, 0.34)",
    border: `1px solid ${borderColor}`,
    borderRadius: "4px",
    padding: "13px 14px",
    boxShadow: status === "approved" ? "inset 3px 0 0 #4ade80" : "inset 3px 0 0 #f87171",
  };
}

const grantLabelStyle: CSSProperties = {
  fontSize: "14px",
  color: "#e2e8f0",
  lineHeight: 1.5,
};

function getStatusDotStyle(status: RoomAccessGrant["status"]): CSSProperties {
  const color =
    status === "approved"
      ? "#4ade80"
      : status === "revoked"
        ? "#f87171"
        : "rgba(255, 255, 255, 0.3)";
  return {
    display: "inline-block",
    width: "8px",
    height: "8px",
    borderRadius: "1px",
    background: color,
    marginRight: "8px",
    flexShrink: 0,
  };
}

const grantActionsStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "10px",
  flexShrink: 0,
};

const revokeButtonStyle: CSSProperties = {
  padding: "6px 12px",
  fontSize: "12px",
  fontWeight: "600",
  background: "rgba(239, 68, 68, 0.15)",
  border: "1px solid rgba(239, 68, 68, 0.4)",
  borderRadius: "4px",
  color: "#f87171",
  cursor: "pointer",
  transition: "background 0.2s",
  whiteSpace: "nowrap",
};

const revokeButtonDisabledStyle: CSSProperties = {
  ...revokeButtonStyle,
  opacity: 0.6,
  cursor: "not-allowed",
};

const enterRoomLinkStyle: CSSProperties = {
  padding: "6px 12px",
  fontSize: "12px",
  fontWeight: "500",
  background: "rgba(99, 102, 241, 0.15)",
  border: "1px solid rgba(99, 102, 241, 0.4)",
  borderRadius: "4px",
  color: "#a5b4fc",
  textDecoration: "none",
  whiteSpace: "nowrap",
};

/* ────────────────────────────────────────────
   Component
   ──────────────────────────────────────────── */

type AccessGrantListProps = {
  roomId: string;
  initialGrants: RoomAccessGrant[];
};

export function AccessGrantList({ roomId, initialGrants }: AccessGrantListProps) {
  const [grantStudentId, setGrantStudentId] = useState("");
  const [grantFeedback, setGrantFeedback] = useState<string | null>(null);
  const [isGrantMutating, setIsGrantMutating] = useState(false);
  const [currentAccessGrants, setCurrentAccessGrants] = useState(initialGrants);

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

  // F-025: Helper to schedule feedback auto-clear with proper cleanup.
  function scheduleFeedbackClear() {
    if (feedbackTimerRef.current) {
      clearTimeout(feedbackTimerRef.current);
    }
    feedbackTimerRef.current = setTimeout(() => setGrantFeedback(null), 3000);
  }

  async function handleCreateGrant() {
    const nextGranteeId = grantStudentId.trim();
    const session = loadSession();

    if (!nextGranteeId) {
      setGrantFeedback("请输入授权学生 ID。");
      return;
    }

    if (!session) {
      setGrantFeedback("当前登录已失效，请重新登录。");
      return;
    }

    setIsGrantMutating(true);
    setGrantFeedback("正在创建授权...");

    try {
      const createdGrant = await createRoomAccessGrant({
        roomId,
        granteeId: nextGranteeId,
        scope: "chat_summary",
        expiresInHours: 24
      }, session.token);

      setCurrentAccessGrants((existingGrants) => [createdGrant, ...existingGrants]);
      setGrantStudentId("");
      setGrantFeedback("授权已创建。");
      scheduleFeedbackClear();
    } catch {
      setGrantFeedback("授权创建失败，请稍后重试。");
    } finally {
      setIsGrantMutating(false);
    }
  }

  async function handleRevokeGrant(grantId: string) {
    const session = loadSession();

    if (!session) {
      setGrantFeedback("当前登录已失效，请重新登录。");
      return;
    }

    setIsGrantMutating(true);
    setGrantFeedback("正在撤销授权...");

    try {
      const revokedGrant = await revokeRoomAccessGrant(grantId, session.token);

      setCurrentAccessGrants((existingGrants) =>
        existingGrants.map((grant) => (grant.id === grantId ? revokedGrant : grant))
      );
      setGrantFeedback("授权已撤销。");
      scheduleFeedbackClear();
    } catch {
      setGrantFeedback("授权撤销失败，请稍后重试。");
    } finally {
      setIsGrantMutating(false);
    }
  }

  return (
    <section className="access-grant-panel" style={sectionStyle}>
      <div>
        <span style={{ display: "block", marginBottom: 5, color: "#c4b5fd", fontSize: 9, fontWeight: 800, letterSpacing: ".18em" }}>ROOM ACCESS</span>
        <h2 style={headingStyle}>授权列表</h2>
        <p style={{ margin: "6px 0 0", color: "#64748b", fontSize: 12 }}>保留授权历史，仅生效中的协作者可进入房间。</p>
      </div>
      <div className="access-grant-form" style={formRowStyle}>
        <div style={inputWrapperStyle}>
          <label htmlFor="grant-student-id" style={labelStyle}>授权学生 ID</label>
          <input
            id="grant-student-id"
            value={grantStudentId}
            onChange={(event) => setGrantStudentId(event.target.value)}
            placeholder="输入学生 ID..."
            style={inputStyle}
          />
        </div>
        <button
          type="button"
          onClick={() => void handleCreateGrant()}
          disabled={isGrantMutating}
          className="access-grant-create"
          style={isGrantMutating ? createButtonDisabledStyle : createButtonStyle}
        >
          创建授权
        </button>
      </div>
      {grantFeedback ? <p role="status" style={feedbackTextStyle}>{grantFeedback}</p> : null}
      {currentAccessGrants.length > 0 ? (
        <ul style={grantListStyle}>
          {currentAccessGrants.map((grant) => (
            <li key={grant.id} className="access-grant-item" style={getGrantItemStyle(grant.status)}>
              <span style={grantLabelStyle}>
                <span style={getStatusDotStyle(grant.status)} />
                {toGrantLabel(grant)}
              </span>
              {grant.status === "approved" ? (
                <span style={grantActionsStyle}>
                  <button
                    type="button"
                    onClick={() => void handleRevokeGrant(grant.id)}
                    disabled={isGrantMutating}
                    className="access-grant-revoke"
                    style={isGrantMutating ? revokeButtonDisabledStyle : revokeButtonStyle}
                  >
                    {`撤销 ${grant.granteeName}`}
                  </button>
                  <Link className="access-grant-enter" href={`/chat?roomId=${grant.roomId}`} style={enterRoomLinkStyle}>
                    进入房间
                  </Link>
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p style={emptyGrantStyle}>暂无授权记录。</p>
      )}
      <style>{`
        .access-grant-panel input:focus { border-color: #a78bfa !important; box-shadow: 0 0 0 3px rgba(139,92,246,.16); }
        .access-grant-create:hover:not(:disabled), .access-grant-revoke:hover:not(:disabled), .access-grant-enter:hover { filter: brightness(1.15); transform: translateY(-1px); }
        .access-grant-create:focus-visible, .access-grant-revoke:focus-visible, .access-grant-enter:focus-visible { outline: 2px solid #c4b5fd; outline-offset: 2px; }
        @media (max-width: 520px) {
          .access-grant-form > * { width: 100%; }
          .access-grant-item { align-items: flex-start !important; }
          .access-grant-item > span:last-child { width: 100%; justify-content: flex-end; }
        }
      `}</style>
    </section>
  );
}

function toGrantStatusLabel(status: RoomAccessGrant["status"]) {
  return status === "revoked" ? "已撤销" : "生效中";
}

function toGrantLabel(grant: RoomAccessGrant) {
  return `${grant.granteeName} · ${grant.scope} · ${toGrantStatusLabel(grant.status)}`;
}
