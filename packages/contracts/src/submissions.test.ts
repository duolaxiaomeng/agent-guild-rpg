import { describe, expect, it } from "vitest";
import { agentSubmissionSchema } from "./submissions";

describe("agentSubmissionSchema", () => {
  it("accepts a complete agent submission payload", () => {
    const result = agentSubmissionSchema.safeParse({
      clientRequestId: "submission-request-001",
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

  it("accepts root-relative artifacts and rejects unsupported artifact kinds", () => {
    const base = {
      clientRequestId: "submission-request-002",
      studentId: "11111111-1111-4111-8111-111111111111",
      courseWorldId: "22222222-2222-4222-8222-222222222222",
      dayId: "day-1",
      agentSessionId: "33333333-3333-4333-8333-333333333333",
      triggerType: "button" as const,
      conversationSummary: "Student compared expected and actual output before correcting the prompt.",
      workSummary: "The agent produced a complete implementation and included verification evidence.",
      selfReflection: "I learned to provide explicit acceptance criteria before asking the agent to implement.",
      agentEvaluationHints: ["verified the result"],
      timestamp: "2026-06-29T12:00:00.000Z"
    };

    expect(agentSubmissionSchema.safeParse({
      ...base,
      artifacts: [{ kind: "demo", label: "课堂演示", url: "/artifacts/demo-1" }]
    }).success).toBe(true);

    expect(agentSubmissionSchema.safeParse({
      ...base,
      artifacts: [{ kind: "binary", label: "未知文件", url: "/artifacts/file" }]
    }).success).toBe(false);
  });

  it("accepts the stable readable IDs used by the classroom seed", () => {
    const result = agentSubmissionSchema.safeParse({
      clientRequestId: "submission-request-seed-001",
      studentId: "student-1",
      courseWorldId: "course-world-1",
      dayId: "day-1",
      agentSessionId: "session-1",
      triggerType: "button",
      conversationSummary: "Student compared expected and actual output before correcting the prompt.",
      workSummary: "The agent produced a complete implementation and included verification evidence.",
      artifacts: [{ kind: "doc", label: "README", url: "/artifacts/readme" }],
      selfReflection: "I learned to provide explicit acceptance criteria before asking the agent to implement.",
      agentEvaluationHints: ["verified the result"],
      timestamp: "2026-06-29T12:00:00.000Z"
    });

    expect(result.success).toBe(true);
  });
});
