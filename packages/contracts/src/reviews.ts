import { z } from "zod";
import { submissionEntityIdSchema } from "./submissions.js";

export const reviewDecisionSchema = z.enum(["approve", "adjust", "reject"]);

export const reviewStatusSchema = z.enum([
  "queued",
  "ai_reviewed",
  "needs_teacher",
  "teacher_decided"
]);

export const reviewResultSchema = z.object({
  submissionId: submissionEntityIdSchema,
  status: reviewStatusSchema.optional(),
  suggestedScore: z.number().int().min(0).nullable(),
  finalScore: z.number().int().min(0).nullable(),
  decision: reviewDecisionSchema.nullable(),
  rationale: z.string().min(10).nullable(),
  riskFlags: z.array(z.string()).optional().default([]),
});

export type ReviewDecision = z.infer<typeof reviewDecisionSchema>;
export type ReviewStatus = z.infer<typeof reviewStatusSchema>;
export type ReviewResult = z.infer<typeof reviewResultSchema>;
