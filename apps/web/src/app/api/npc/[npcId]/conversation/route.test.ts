import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

describe("same-origin NPC conversation route", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("forwards the HttpOnly session cookie as a bearer credential", async () => {
    const payload = {
      npcId: "receptionist",
      npcName: "前台接待",
      reply: "欢迎来到工作室！",
      degraded: true,
      llmUsed: false,
    };
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(payload), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchSpy);

    const response = await GET(
      new Request(
        "http://localhost:3000/api/npc/receptionist/conversation?studentId=student-1&message=hello",
        { headers: { cookie: "agent-guild-session-token=session-raw-token" } },
      ),
      { params: Promise.resolve({ npcId: "receptionist" }) },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(payload);
    expect(fetchSpy).toHaveBeenCalledWith(
      "http://127.0.0.1:3001/npc/receptionist/conversation?studentId=student-1&message=hello",
      expect.objectContaining({
        headers: { Authorization: "Bearer session-raw-token" },
        cache: "no-store",
      }),
    );
  });

  it("rejects requests without a session cookie", async () => {
    const response = await GET(
      new Request("http://localhost:3000/api/npc/receptionist/conversation"),
      { params: Promise.resolve({ npcId: "receptionist" }) },
    );

    expect(response.status).toBe(401);
  });
});
