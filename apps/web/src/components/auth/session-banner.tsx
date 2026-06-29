"use client";

import { useEffect, useState } from "react";
import { getCurrentSession, type AuthSession, type AuthUser } from "../../lib/api-client";
import { clearSession, loadSession, saveSession } from "../../lib/session";

function toRoleLabel(role: AuthUser["role"]) {
  return role === "teacher" ? "老师" : "学生";
}

function toBannerText(session: AuthSession | null) {
  if (!session) {
    return "未登录";
  }

  return `${session.user.displayName}（${toRoleLabel(session.user.role)}）`;
}

export function SessionBanner() {
  const [session, setSession] = useState<AuthSession | null>(null);

  useEffect(() => {
    let disposed = false;

    async function syncSession() {
      const storedSession = loadSession();

      if (!storedSession) {
        if (!disposed) {
          setSession(null);
        }
        return;
      }

      try {
        const nextSession = await getCurrentSession(storedSession.token);
        saveSession(nextSession);

        if (!disposed) {
          setSession(nextSession);
        }
      } catch {
        clearSession();

        if (!disposed) {
          setSession(null);
        }
      }
    }

    void syncSession();

    return () => {
      disposed = true;
    };
  }, []);

  return <p>当前登录：{toBannerText(session)}</p>;
}
