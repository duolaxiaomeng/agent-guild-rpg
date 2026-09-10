import { NextResponse } from "next/server";

const API_BASE_URL = process.env.API_INTERNAL_BASE_URL
  ?? process.env.NEXT_PUBLIC_API_BASE_URL
  ?? "http://127.0.0.1:3001";
const SESSION_COOKIE = "agent-guild-session-token";

type RouteContext = {
  params: Promise<{ npcId: string }>;
};

function readSessionToken(request: Request): string | null {
  const cookieHeader = request.headers.get("cookie") ?? "";
  const match = cookieHeader.match(/(?:^|;\s*)agent-guild-session-token=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

export async function GET(request: Request, context: RouteContext) {
  const token = readSessionToken(request);
  if (!token) {
    return NextResponse.json({ message: "未登录或登录已过期" }, { status: 401 });
  }

  const { npcId } = await context.params;
  const query = new URL(request.url).search;

  try {
    const upstream = await fetch(
      `${API_BASE_URL}/npc/${encodeURIComponent(npcId)}/conversation${query}`,
      {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      },
    );
    const body = await upstream.text();
    return new NextResponse(body, {
      status: upstream.status,
      headers: {
        "content-type": upstream.headers.get("content-type") ?? "application/json",
      },
    });
  } catch {
    return NextResponse.json({ message: "NPC 对话服务暂时不可用" }, { status: 502 });
  }
}
