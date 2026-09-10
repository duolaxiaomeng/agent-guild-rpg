import { describe, expect, it } from "vitest";
import { authSessionSchema } from "./auth.js";

describe("auth session contract", () => {
  it("keeps the registration cohort in the student session", () => {
    const parsed = authSessionSchema.parse({
      token: "session_student-new",
      user: {
        id: "123e4567-e89b-12d3-a456-426614174000",
        role: "student",
        displayName: "新同学",
        cohort: {
          id: "cohort-chuangshuo-agent-1",
          name: "船说agent第一期班"
        }
      }
    });

    expect(parsed.user.cohort).toEqual({
      id: "cohort-chuangshuo-agent-1",
      name: "船说agent第一期班"
    });
  });
});
