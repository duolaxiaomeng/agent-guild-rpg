import { NextResponse } from "next/server";

const API_BASE_URL = process.env.API_INTERNAL_BASE_URL
  ?? process.env.NEXT_PUBLIC_API_BASE_URL
  ?? "http://127.0.0.1:3001";
const SESSION_COOKIE = "agent-guild-session-token";
const secureCookie = process.env.NODE_ENV === "production" && process.env.ALLOW_INSECURE_LOCALHOST !== "1";

export async function POST(request: Request) {
  const cookieHeader = request.headers.get("cookie") ?? "";
  const token = cookieHeader.match(/(?:^|;\s*)agent-guild-session-token=([^;]+)/)?.[1];
  if (token) {
    await fetch(`${API_BASE_URL}/auth/logout`, {
      method: "POST",
      headers: { Authorization: `Bearer ${decodeURIComponent(token)}` },
      cache: "no-store"
    }).catch(() => undefined);
  }

  const response = NextResponse.json({ success: true });
  response.cookies.set({
    name: SESSION_COOKIE,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: secureCookie,
    maxAge: 0,
    path: "/"
  });
  return response;
}
