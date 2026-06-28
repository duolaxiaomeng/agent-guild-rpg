import { describe, expect, it } from "vitest";
import { agentSubmissionSchema } from "./submissions";

describe("agentSubmissionSchema", () => {
  it("accepts a complete agent submission payload", () => {
    const result = agentSubmissionSchema.safeParse({
      studentId: "11111111-1111-4111-8111-111111111111",
      courseWorldId: "22222222-2222-4222-8222-222222222222",
      dayId: "day-1",
      agentSessionId: "33333333-3333-4333-8333-333333333333",
      triggerType: "button",
      conversationSummary: "Student wrote a clear goal, compared expected and actual output, and corrected the prompt.",
      workSummary: "The agent produced a README update and a demo screenshot for the day one task.",
      artifacts: [{ kind: "doc", label: "README", url: "https://example.com/readme" }],
      selfReflection: "I learned that the agent follows clearer instructions when I state expected output first.",
      agentEvaluationHints: ["used expectation framing", "performed one correction round"],
      timestamp: "2026-06-29T12:00:00.000Z"
    });

    expect(result.success).toBe(true);
  });
});
