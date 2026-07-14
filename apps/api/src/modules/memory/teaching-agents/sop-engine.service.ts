import { Inject, Injectable } from "@nestjs/common";
import type OpenAI from "openai";
import { chat, isArkConfigured } from "../llm/ark-adapter";
import { TEACHING_AGENT_ROLES, type AgentRoleKey } from "./agent-roles";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type SopType = "submission-review" | "student-question" | "quest-completion";

export type SopStep = {
  agentRole: string;
  agentName: string;
  output: string;
  timestamp: string;
};

export type SopResult = {
  sopType: SopType;
  steps: SopStep[];
  finalOutput: string;
  completedAt: string;
  degraded: boolean;
  llmUsed: boolean;
};

export type SopInput = {
  // submission-review
  submissionId?: string;
  workSummary?: string;
  selfReflection?: string;
  artifacts?: Array<{ kind: string; label: string; url: string }>;
  agentEvaluationHints?: string[];
  // student-question
  studentId?: string;
  question?: string;
  // quest-completion
  questId?: string;
  questTitle?: string;
  submissionSummary?: string;
};

/* ------------------------------------------------------------------ */
/*  SOP Step Definition                                                */
/* ------------------------------------------------------------------ */

interface SopStepDef {
  agentRole: AgentRoleKey;
  /** Build the user-prompt for this step, given accumulated context. */
  buildPrompt: (input: SopInput, previousOutputs: string[]) => string;
  /** Rule-based fallback when LLM is not available. */
  fallback: (input: SopInput, previousOutputs: string[]) => string;
}

interface SopDefinition {
  steps: SopStepDef[];
  /** Produce the final output from all step outputs. */
  finalize: (steps: SopStep[], input: SopInput) => string;
}

/* ------------------------------------------------------------------ */
/*  SOP Definitions                                                    */
/* ------------------------------------------------------------------ */

const SOP_DEFINITIONS: Record<SopType, SopDefinition> = {
  /* ---- submission-review ---- */
  "submission-review": {
    steps: [
      {
        agentRole: "reviewer",
        buildPrompt: (input) =>
          `请对以下学生提交进行初步评审。\n\n` +
          `工作摘要: ${input.workSummary ?? "未提供"}\n` +
          `自我反思: ${input.selfReflection ?? "未提供"}\n` +
          `AI评估提示: ${(input.agentEvaluationHints ?? []).join("; ")}\n` +
          `工件数量: ${input.artifacts?.length ?? 0}\n\n` +
          `请从优点、不足、改进建议三个方面给出结构化评审意见。`,
        fallback: (input) =>
          `【评审 Agent 初评】\n` +
          `优点: 提交包含${input.artifacts?.length ?? 0}个工件，工作摘要清晰。\n` +
          `不足: 需要更详细的自我反思和技术深度说明。\n` +
          `改进建议: 建议补充代码实现细节和测试覆盖情况。`,
      },
      {
        agentRole: "ta",
        buildPrompt: (input, prev) =>
          `评审 Agent 已完成初步评审，请基于评审结果补充学习建议。\n\n` +
          `评审结果: ${prev[0] ?? "无"}\n\n` +
          `学生自我反思: ${input.selfReflection ?? "未提供"}\n\n` +
          `请补充3条具体的学习改进建议。`,
        fallback: (_input, _prev) =>
          `【助教 Agent 补充建议】\n` +
          `1. 建议学生回顾核心概念，巩固基础。\n` +
          `2. 多参考优秀提交案例，对比学习。\n` +
          `3. 加强实践练习，提升动手能力。`,
      },
      {
        agentRole: "reviewer",
        buildPrompt: (_input, prev) =>
          `基于以下评审和建议，生成最终评审报告。\n\n` +
          `初评结果: ${prev[0] ?? "无"}\n` +
          `助教建议: ${prev[1] ?? "无"}\n\n` +
          `请生成一份简洁的最终评审报告，包含总体评价和评分建议(1-100)。`,
        fallback: (_input, _prev) =>
          `【最终评审报告】\n` +
          `总体评价: 提交完成度良好，学生展现了基本的学习能力。\n` +
          `评分建议: 75/100\n` +
          `关键改进点: 需要加强技术深度和反思质量。`,
      },
    ],
    finalize: (steps) =>
      `提交评审 SOP 完成，共${steps.length}步。\n\n` +
      steps.map((s) => `[${s.agentName}]\n${s.output}`).join("\n\n"),
  },

  /* ---- student-question ---- */
  "student-question": {
    steps: [
      {
        agentRole: "ta",
        buildPrompt: (input) =>
          `学生提出了以下问题，请给出初步解答。\n\n` +
          `问题: ${input.question ?? "未提供"}\n\n` +
          `请用简洁的语言解释核心概念，控制在200字以内。`,
        fallback: (input) =>
          `【助教 Agent 初步解答】\n` +
          `关于"${input.question ?? "该问题"}"，这是一个重要的概念。` +
          `建议先理解基础定义，再通过实践加深理解。`,
      },
      {
        agentRole: "mentor",
        buildPrompt: (input, prev) =>
          `助教已给出初步解答，请进行深度解析。\n\n` +
          `原问题: ${input.question ?? "未提供"}\n` +
          `助教解答: ${prev[0] ?? "无"}\n\n` +
          `请提供更深入的解释，包含实例和扩展知识。`,
        fallback: (input, _prev) =>
          `【答疑 Agent 深度解析】\n` +
          `针对"${input.question ?? "该问题"}"，从原理层面来看：\n` +
          `1. 核心原理: 需要理解其底层机制。\n` +
          `2. 实际应用: 在实际项目中，这通常用于解决特定问题。\n` +
          `3. 扩展建议: 建议进一步学习相关进阶内容。`,
      },
      {
        agentRole: "ta",
        buildPrompt: (_input, prev) =>
          `基于初步解答和深度解析，请生成综合回答总结。\n\n` +
          `初步解答: ${prev[0] ?? "无"}\n` +
          `深度解析: ${prev[1] ?? "无"}\n\n` +
          `请生成一段简洁的综合回答，帮助学生快速理解要点。`,
        fallback: (_input, _prev) =>
          `【综合回答】\n` +
          `综合以上分析，该问题的关键在于理解核心概念并在实践中应用。` +
          `建议按照"理解原理→动手实践→总结反思"的路径学习。`,
      },
    ],
    finalize: (steps) =>
      `学生答疑 SOP 完成，共${steps.length}步。\n\n` +
      steps.map((s) => `[${s.agentName}]\n${s.output}`).join("\n\n"),
  },

  /* ---- quest-completion ---- */
  "quest-completion": {
    steps: [
      {
        agentRole: "reviewer",
        buildPrompt: (input) =>
          `请验证以下关卡完成情况。\n\n` +
          `关卡: ${input.questTitle ?? input.questId ?? "未知"}\n` +
          `提交摘要: ${input.submissionSummary ?? "未提供"}\n\n` +
          `请验证提交是否满足关卡要求，给出通过/不通过建议。`,
        fallback: (input) =>
          `【评审 Agent 验证】\n` +
          `关卡: ${input.questTitle ?? input.questId ?? "未知"}\n` +
          `验证结果: 提交基本满足关卡要求，建议通过。\n` +
          `备注: 部分内容可以进一步优化。`,
      },
      {
        agentRole: "ta",
        buildPrompt: (input, prev) =>
          `评审已完成验证，请总结学生的学习成果。\n\n` +
          `验证结果: ${prev[0] ?? "无"}\n` +
          `关卡: ${input.questTitle ?? input.questId ?? "未知"}\n\n` +
          `请总结学生在此关卡中学到的核心知识点和技能。`,
        fallback: (input, _prev) =>
          `【助教 Agent 总结】\n` +
          `在"${input.questTitle ?? input.questId ?? "该关卡"}"中，学生：\n` +
          `1. 掌握了核心概念和基本应用。\n` +
          `2. 完成了关键实践任务。\n` +
          `3. 展现了独立思考和解决问题的能力。`,
      },
      {
        agentRole: "reviewer",
        buildPrompt: (_input, prev) =>
          `基于验证结果和学习总结，生成关卡完成报告。\n\n` +
          `验证结果: ${prev[0] ?? "无"}\n` +
          `学习总结: ${prev[1] ?? "无"}\n\n` +
          `请生成简洁的关卡完成报告，包含完成状态和下一步建议。`,
        fallback: (_input, _prev) =>
          `【关卡完成报告】\n` +
          `完成状态: 已完成\n` +
          `学习成果: 学生已掌握本关卡核心内容。\n` +
          `下一步建议: 建议进入下一关卡继续深入学习。`,
      },
    ],
    finalize: (steps) =>
      `关卡完成 SOP 完成，共${steps.length}步。\n\n` +
      steps.map((s) => `[${s.agentName}]\n${s.output}`).join("\n\n"),
  },
};

/* ------------------------------------------------------------------ */
/*  Service                                                            */
/* ------------------------------------------------------------------ */

const MAX_STEPS = 3;

@Injectable()
export class SopEngineService {
  constructor() {}

  /**
   * Execute a SOP flow.
   *
   * - When ARK_API_KEY is configured, each step calls the LLM.
   * - When not configured, each step returns a rule-based fallback.
   * - Steps are executed sequentially with context passed forward.
   * - Maximum 3 LLM calls per SOP (cost control).
   */
  async runSop(sopType: SopType, input: SopInput): Promise<SopResult> {
    const definition = SOP_DEFINITIONS[sopType];
    const degraded = !isArkConfigured();
    const steps: SopStep[] = [];
    const previousOutputs: string[] = [];
    let llmUsed = !degraded; // assume LLM used unless degraded or all steps fail

    const stepDefs = definition.steps.slice(0, MAX_STEPS);
    let anyStepSucceededWithLlm = false;

    for (const [stepIndex, stepDef] of stepDefs.entries()) {
      const role = TEACHING_AGENT_ROLES[stepDef.agentRole];
      const stepName = role.name;
      let output: string;

      if (degraded) {
        output = stepDef.fallback(input, previousOutputs);
      } else {
        try {
          output = await this.callLlm(
            role.systemPrompt,
            stepDef.buildPrompt(input, previousOutputs),
          );
          if (!output || output.trim().length === 0) {
            output = stepDef.fallback(input, previousOutputs);
          } else {
            anyStepSucceededWithLlm = true;
          }
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : String(error);
          console.warn(`[SOP] Step ${stepIndex} "${stepName}" LLM call failed, using rule fallback: ${message}`);
          output = stepDef.fallback(input, previousOutputs);
        }
      }

      steps.push({
        agentRole: stepDef.agentRole,
        agentName: role.name,
        output,
        timestamp: new Date().toISOString(),
      });
      previousOutputs.push(output);
    }

    const finalOutput = definition.finalize(steps, input);

    return {
      sopType,
      steps,
      finalOutput,
      completedAt: new Date().toISOString(),
      degraded,
      llmUsed: !degraded && anyStepSucceededWithLlm,
    };
  }

  private async callLlm(
    systemPrompt: string,
    userMessage: string,
  ): Promise<string> {
    const messages: OpenAI.ChatCompletionMessageParam[] = [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage },
    ];
    return chat(messages);
  }

  /** Return the list of available SOP types with metadata. */
  getSopTypes(): Array<{
    type: SopType;
    label: string;
    description: string;
    steps: string[];
  }> {
    return [
      {
        type: "submission-review",
        label: "提交评审 SOP",
        description:
          "评审 Agent 初评 → 助教 Agent 补充建议 → 生成最终评审报告",
        steps: ["评审 Agent 初评", "助教 Agent 补充建议", "生成最终评审报告"],
      },
      {
        type: "student-question",
        label: "学生答疑 SOP",
        description:
          "助教 Agent 初步解答 → 答疑 Agent 深度解析 → 生成综合回答",
        steps: ["助教 Agent 初步解答", "答疑 Agent 深度解析", "生成综合回答"],
      },
      {
        type: "quest-completion",
        label: "关卡完成 SOP",
        description:
          "评审 Agent 验证提交 → 助教 Agent 总结学习成果 → 生成关卡完成报告",
        steps: [
          "评审 Agent 验证提交",
          "助教 Agent 总结学习成果",
          "生成关卡完成报告",
        ],
      },
    ];
  }
}
