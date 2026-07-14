import { describe, expect, it, vi } from "vitest";
import { POST } from "./route";

describe("same-origin auth login route", () => {
  it("sets an HttpOnly session cookie when the API login succeeds", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            token: "session-raw-token",
            expiresAt: "2026-07-13T00:00:00.000Z",
            user: { id: "teacher-1", role: "teacher", displayName: "Teacher Lin" }
          }),
          { status: 201, headers: { "content-type": "application/json" } }
        )
      )
    );

    const response = await POST(
      new Request("http://localhost:3000/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email: "teacher@academy.test", password: "teacher-pass-123" }),
        headers: { "content-type": "application/json" }
      })
    );

    expect(response.status).toBe(201);
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
    vi.unstubAllGlobals();
  });
});
