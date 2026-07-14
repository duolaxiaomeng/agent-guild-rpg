import { z } from "zod";

/* ------------------------------------------------------------------ */
/*  SOP Types                                                          */
/* ------------------------------------------------------------------ */

export const sopTypeSchema = z.enum([
  "submission-review",
  "student-question",
  "quest-completion",
]);

export type SopType = z.infer<typeof sopTypeSchema>;

/* ------------------------------------------------------------------ */
/*  SOP Step                                                           */
/* ------------------------------------------------------------------ */

export const sopStepSchema = z.object({
  agentRole: z.string(),
  agentName: z.string(),
  output: z.string(),
  timestamp: z.string().datetime(),
});

export type SopStep = z.infer<typeof sopStepSchema>;

/* ------------------------------------------------------------------ */
/*  SOP Result                                                         */
/* ------------------------------------------------------------------ */

export const sopResultSchema = z.object({
  sopType: sopTypeSchema,
  steps: z.array(sopStepSchema),
  finalOutput: z.string(),
  completedAt: z.string().datetime(),
  degraded: z.boolean(),
});

export type SopResult = z.infer<typeof sopResultSchema>;

/* ------------------------------------------------------------------ */
/*  Request Schemas                                                    */
/* ------------------------------------------------------------------ */

export const questionRequestSchema = z.object({
  studentId: z.string(),
  question: z.string().min(1),
});

export type QuestionRequest = z.infer<typeof questionRequestSchema>;

export const reviewRequestSchema = z.object({
  submissionId: z.string(),
});

export type ReviewRequest = z.infer<typeof reviewRequestSchema>;

export const questCompletionRequestSchema = z.object({
  studentId: z.string(),
  questId: z.string(),
});

export type QuestCompletionRequest = z.infer<
  typeof questCompletionRequestSchema
>;

/* ------------------------------------------------------------------ */
/*  SOP Type Metadata                                                  */
/* ------------------------------------------------------------------ */

export const sopTypeInfoSchema = z.object({
  type: sopTypeSchema,
  label: z.string(),
  description: z.string(),
  steps: z.array(z.string()),
});

export type SopTypeInfo = z.infer<typeof sopTypeInfoSchema>;

export const SOP_TYPES: SopTypeInfo[] = [
  {
    type: "submission-review",
    label: "提交评审 SOP",
    description: "评审 Agent 初评 → 助教 Agent 补充建议 → 生成最终评审报告",
    steps: ["评审 Agent 初评", "助教 Agent 补充建议", "生成最终评审报告"],
  },
  {
    type: "student-question",
    label: "学生答疑 SOP",
    description: "助教 Agent 初步解答 → 答疑 Agent 深度解析 → 生成综合回答",
    steps: ["助教 Agent 初步解答", "答疑 Agent 深度解析", "生成综合回答"],
  },
  {
    type: "quest-completion",
    label: "关卡完成 SOP",
    description: "评审 Agent 验证提交 → 助教 Agent 总结学习成果 → 生成关卡完成报告",
    steps: ["评审 Agent 验证提交", "助教 Agent 总结学习成果", "生成关卡完成报告"],
  },
];
