import { NextResponse } from "next/server";

const API_BASE_URL = process.env.API_INTERNAL_BASE_URL
  ?? process.env.NEXT_PUBLIC_API_BASE_URL
  ?? "http://127.0.0.1:3001";
const SESSION_COOKIE = "agent-guild-session-token";
const secureCookie = process.env.NODE_ENV === "production" && process.env.ALLOW_INSECURE_LOCALHOST !== "1";

export async function POST(request: Request) {
  const body = await request.json();
  const upstream = await fetch(`${API_BASE_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store"
  });
  const payload = await upstream.json();

  if (!upstream.ok) {
    return NextResponse.json(payload, { status: upstream.status });
  }

  const response = NextResponse.json(payload, { status: upstream.status });
  response.cookies.set({
    name: SESSION_COOKIE,
    value: payload.token,
    httpOnly: true,
    sameSite: "lax",
    secure: secureCookie,
    maxAge: 8 * 60 * 60,
    path: "/"
  });
  return response;
}
