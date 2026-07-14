"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getCurrentSession, type AuthSession, type AuthUser } from "../../lib/api-client";
import { clearSession, loadSession, saveSession } from "../../lib/session";

function toRoleLabel(role: AuthUser["role"]) {
  return role === "teacher" ? "老师" : "学生";
}

type BannerState =
  | { kind: "loading" }
  | { kind: "loaded"; session: AuthSession }
  | { kind: "guest" }
  | { kind: "network-error"; lastSession: AuthSession | null };

function toBannerText(state: BannerState): string {
  switch (state.kind) {
    case "loading":
      return "登录状态确认中...";
    case "loaded":
      return `${state.session.user.displayName}（${toRoleLabel(state.session.user.role)}）`;
    case "guest":
      return "未登录";
    case "network-error":
      return state.lastSession
        ? `${state.lastSession.user.displayName}（${toRoleLabel(state.lastSession.user.role)}）`
        : "登录状态确认中...";
  }
}

export function SessionBanner() {
  const router = useRouter();
  const [state, setState] = useState<BannerState>({ kind: "loading" });
  const lastSessionRef = useRef<AuthSession | null>(null);

  useEffect(() => {
    let disposed = false;

    async function syncSession() {
      const storedSession = loadSession();

      if (!storedSession) {
        if (!disposed) {
          setState({ kind: "guest" });
        }
        return;
      }

      lastSessionRef.current = storedSession;
      if (!disposed) {
        setState({ kind: "loaded", session: storedSession });
      }

      try {
        const nextSession = await getCurrentSession(storedSession.token);
        // F-024: Re-saving the session on each mount refreshes the cookie's
        // max-age, implementing a sliding expiration. This is by design —
        // it keeps the session alive while the user is actively browsing.
        saveSession(nextSession);
        lastSessionRef.current = nextSession;

        if (!disposed) {
          setState({ kind: "loaded", session: nextSession });
        }
      } catch (error: any) {
        const message = error?.message ?? "";
        const isAuthError = message.includes(": 401") || message.includes(": 403");

        if (isAuthError) {
          // A stale/expired HttpOnly cookie cannot be removed by
          // `document.cookie`; ask the same-origin route to clear it.
          await fetch("/api/auth/logout", {
            method: "POST",
            credentials: "include"
          }).catch(() => undefined);
          clearSession();
          lastSessionRef.current = null;
          if (!disposed) {
            setState({ kind: "guest" });
          }
        } else {
          // H-009: Network error — keep showing the last known session
          // instead of flashing "未登录".
          if (!disposed) {
            setState({ kind: "network-error", lastSession: lastSessionRef.current });
          }
        }
      }
    }

    void syncSession();

    return () => {
      disposed = true;
    };
  }, []);

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" }).catch(() => undefined);
    clearSession();
    lastSessionRef.current = null;
    router.push("/login");
  }

  const showLogout = state.kind === "loaded" || state.kind === "network-error";

  return (
    <div
      className="session-banner"
      data-state={state.kind}
    >
      <span
        className="session-banner__identity"
        role="status"
        aria-live="polite"
      >
        当前登录：{toBannerText(state)}
      </span>
      {state.kind === "network-error" ? (
        <span className="session-banner__notice">离线快照</span>
      ) : null}
      {showLogout ? (
        <button
          className="session-banner__logout"
          type="button"
          onClick={handleLogout}
        >
          退出
        </button>
      ) : null}
    </div>
  );
}
