import { z } from "zod";

export const reviewDecisionSchema = z.enum(["approve", "adjust", "reject"]);

export const reviewResultSchema = z.object({
  submissionId: z.string().uuid(),
  suggestedScore: z.number().int().min(0),
  finalScore: z.number().int().min(0),
  decision: reviewDecisionSchema,
  rationale: z.string().min(10),
  riskFlags: z.array(z.string())
});
