import { z } from "zod";

export const submissionTriggerSchema = z.enum([
  "button",
  "chat_command",
  "schedule"
]);

export const submissionEntityIdSchema = z.string().trim().min(1).max(128);

export const artifactSchema = z.object({
  kind: z.enum(["repo", "doc", "image", "demo", "command_log"]),
  label: z.string().trim().min(1).max(120),
  url: z.string().trim().min(1).max(2048).refine((value) => {
    if (value.startsWith("/")) {
      return !value.startsWith("//");
    }

    try {
      const url = new URL(value);
      return url.protocol === "http:" || url.protocol === "https:";
    } catch {
      return false;
    }
  }, "artifact URL must be an HTTP(S) URL or a root-relative path")
});

export const agentSubmissionSchema = z.object({
  clientRequestId: z.string().trim().min(8).max(128),
  studentId: submissionEntityIdSchema,
  courseWorldId: submissionEntityIdSchema,
  dayId: submissionEntityIdSchema,
  agentSessionId: submissionEntityIdSchema,
  triggerType: submissionTriggerSchema,
  conversationSummary: z.string().trim().min(20).max(12000),
  workSummary: z.string().trim().min(20).max(12000),
  artifacts: z.array(artifactSchema).min(1).max(100),
  selfReflection: z.string().trim().min(20).max(12000),
  agentEvaluationHints: z.array(z.string().trim().min(1).max(500)).min(1).max(100),
  timestamp: z.string().datetime()
});

export type AgentSubmission = z.infer<typeof agentSubmissionSchema>;
