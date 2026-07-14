import { cookies } from "next/headers";
import { getCurrentSession, type AuthSession } from "./api-client";
import { SESSION_TOKEN_COOKIE } from "./session";

/**
 * Custom error that carries the HTTP status code, allowing callers
 * to distinguish auth errors (401/403) from network/server errors
 * without relying on string matching.
 */
export class ApiError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = "ApiError";
    this.statusCode = statusCode;
  }
}

/**
 * Three-state result for server-side session resolution.
 *
 * - "authenticated"    — token is valid, session is available
 * - "unauthenticated"  — no cookie or token rejected by API (401/403)
 * - "api-unreachable"  — API could not be reached (network error, timeout, 5xx)
 *
 * This distinction allows pages to show a degraded notice instead of
 * redirecting to /login when the API is temporarily down.
 */
export type ServerSessionResult =
  | { status: "authenticated"; session: AuthSession }
  | { status: "unauthenticated" }
  | { status: "api-unreachable" };

export async function getServerSession(): Promise<ServerSessionResult> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_TOKEN_COOKIE)?.value;

  if (!token) {
    return { status: "unauthenticated" };
  }

  try {
    const session = await getCurrentSession(token);
    return { status: "authenticated", session };
  } catch (error) {
    // Distinguish auth errors (401/403) from network / server errors.
    // The fetch helper throws: `Failed to fetch /auth/session: <status>`
    const message = error instanceof Error ? error.message : "";
    const statusMatch = message.match(/:\s*(\d{3})\s*$/);
    const statusCode = statusMatch ? parseInt(statusMatch[1], 10) : 0;
    const isAuthError = statusCode === 401 || statusCode === 403;
    return isAuthError
      ? { status: "unauthenticated" }
      : { status: "api-unreachable" };
  }
}
