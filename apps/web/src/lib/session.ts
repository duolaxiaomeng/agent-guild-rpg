import type { AuthSession } from "./api-client";

export const SESSION_STORAGE_KEY = "agent-guild-session";
export const SESSION_TOKEN_COOKIE = "agent-guild-session-token";

// Extended type to include expiresAt from the login response (A-014)
type StoredSession = AuthSession & { expiresAt?: string };

function canUseBrowserStorage() {
  return typeof window !== "undefined";
}

function isProduction() {
  return process.env.NODE_ENV === "production";
}

export function loadSession(): AuthSession | null {
  if (!canUseBrowserStorage()) {
    return null;
  }

  const rawSession = window.localStorage.getItem(SESSION_STORAGE_KEY);

  if (!rawSession) {
    return null;
  }

  try {
    const session = JSON.parse(rawSession) as StoredSession;

    // F-008: Check if the session has expired. In production the token is
    // intentionally absent from this browser snapshot, so the HttpOnly
    // cookie/API remains the source of truth for expiration.
    if (session.token && session.expiresAt) {
      const expiresAt = new Date(session.expiresAt);
      if (expiresAt <= new Date()) {
        // Session expired — clean up and return null
        window.localStorage.removeItem(SESSION_STORAGE_KEY);
        if (!isProduction()) {
          window.document.cookie = `${SESSION_TOKEN_COOKIE}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; samesite=lax`;
        }
        return null;
      }
    }

    return session as AuthSession;
  } catch {
    window.localStorage.removeItem(SESSION_STORAGE_KEY);
    return null;
  }
}

export function saveSession(session: AuthSession) {
  if (!canUseBrowserStorage()) {
    return;
  }

  // The production login proxy stores the raw token in an HttpOnly cookie.
  // Keep only the identity snapshot in localStorage there so XSS cannot read
  // the bearer credential. Development keeps the legacy token snapshot for
  // direct local API debugging.
  const storedSession = isProduction()
    ? { ...session, token: "" }
    : session;
  window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(storedSession));

  if (isProduction()) {
    return;
  }

  const secureFlag = isProduction() ? "; secure" : "";
  window.document.cookie = `${SESSION_TOKEN_COOKIE}=${encodeURIComponent(session.token)}; path=/; max-age=28800; samesite=lax${secureFlag}`;
}

export function clearSession() {
  if (!canUseBrowserStorage()) {
    return;
  }

  window.localStorage.removeItem(SESSION_STORAGE_KEY);
  window.document.cookie = `${SESSION_TOKEN_COOKIE}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; samesite=lax`;
}
