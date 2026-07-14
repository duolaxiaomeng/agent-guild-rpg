import { z } from "zod";

export const reviewDecisionSchema = z.enum(["approve", "adjust", "reject"]);

export const reviewResultSchema = z.object({
  submissionId: z.string().uuid(),
  suggestedScore: z.number().int().min(0).nullable(),
  finalScore: z.number().int().min(0).nullable(),
  decision: reviewDecisionSchema.nullable(),
  rationale: z.string().min(10).nullable(),
  riskFlags: z.array(z.string()).optional().default([]),
});
