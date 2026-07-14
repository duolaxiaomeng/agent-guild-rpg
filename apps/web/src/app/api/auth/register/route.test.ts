import { describe, expect, it, vi } from "vitest";
import { POST } from "./route";

describe("same-origin auth register route", () => {
  it("forwards registration and sets an HttpOnly session cookie on success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            token: "session-new-student",
            user: { id: "student-new", role: "student", displayName: "新同学" }
          }),
          { status: 201, headers: { "content-type": "application/json" } }
        )
      )
    );

    const response = await POST(
      new Request("http://localhost:3000/api/auth/register", {
        method: "POST",
        body: JSON.stringify({
          displayName: "新同学",
          email: "new@academy.test",
          password: "student-pass-123",
          registrationCode: "chuangshuo_agent_one"
        }),
        headers: { "content-type": "application/json" }
      })
    );

    expect(response.status).toBe(201);
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
    expect(fetch).toHaveBeenCalledWith(
      "http://127.0.0.1:3001/auth/register",
      expect.objectContaining({ method: "POST" })
    );
    vi.unstubAllGlobals();
  });
});
