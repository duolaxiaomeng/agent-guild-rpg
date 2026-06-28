import { z } from "zod";

export const submissionTriggerSchema = z.enum([
  "button",
  "chat_command",
  "schedule"
]);

export const artifactSchema = z.object({
  kind: z.enum(["repo", "doc", "image", "demo", "command_log"]),
  label: z.string().min(1),
  url: z.string().url()
});

export const agentSubmissionSchema = z.object({
  studentId: z.string().uuid(),
  courseWorldId: z.string().uuid(),
  dayId: z.string(),
  agentSessionId: z.string().uuid(),
  triggerType: submissionTriggerSchema,
  conversationSummary: z.string().min(20),
  workSummary: z.string().min(20),
  artifacts: z.array(artifactSchema).min(1),
  selfReflection: z.string().min(20),
  agentEvaluationHints: z.array(z.string()).min(1),
  timestamp: z.string().datetime()
});

export type AgentSubmission = z.infer<typeof agentSubmissionSchema>;
