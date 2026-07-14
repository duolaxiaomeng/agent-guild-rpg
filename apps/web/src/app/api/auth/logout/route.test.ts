import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

describe("same-origin auth logout route", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("revokes the upstream session and clears the HttpOnly cookie", async () => {
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { "content-type": "application/json" }
      })
    );
    vi.stubGlobal("fetch", fetchSpy);

    const response = await POST(
      new Request("http://localhost:3000/api/auth/logout", {
        method: "POST",
        headers: { cookie: "agent-guild-session-token=session-raw-token" }
      })
    );

    expect(response.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledWith(
      "http://127.0.0.1:3001/auth/logout",
      expect.objectContaining({
        method: "POST",
        headers: { Authorization: "Bearer session-raw-token" }
      })
    );
    expect(response.headers.get("set-cookie")).toMatch(/HttpOnly/);
    expect(response.headers.get("set-cookie")).toMatch(/Max-Age=0/);
  });
});
