import { z } from "zod";

export const studentInsightSchema = z.object({
  strengths: z.array(z.string()),
  weaknesses: z.array(z.string()),
  recommendations: z.array(z.string()),
  nextQuestSuggestion: z.string()
});

export const classInsightSchema = z.object({
  commonIssues: z.array(z.string()),
  topPerformers: z.array(z.string()),
  needsAttention: z.array(z.string()),
  classProgress: z.string()
});

export type StudentInsight = z.infer<typeof studentInsightSchema>;
export type ClassInsight = z.infer<typeof classInsightSchema>;
