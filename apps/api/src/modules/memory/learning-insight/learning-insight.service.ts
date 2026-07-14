import { Inject, Injectable } from "@nestjs/common";
import { PrismaService } from "../../../prisma/prisma.service";
import { chat, isArkConfigured } from "../llm/ark-adapter";

export type StudentInsight = {
  strengths: string[];
  weaknesses: string[];
  recommendations: string[];
  nextQuestSuggestion: string;
  llmUsed: boolean;
};

export type ClassInsight = {
  commonIssues: string[];
  topPerformers: string[];
  needsAttention: string[];
  classProgress: string;
  llmUsed: boolean;
};

interface StudentMemoryData {
  reflections: string[];
  observations: string[];
  submissionCount: number;
  avgImportance: number;
}

interface ClassMemoryData {
  totalStudents: number;
  totalReflections: string[];
  totalObservations: string[];
  studentSummaries: Array<{
    studentId: string;
    displayName: string;
    reflectionCount: number;
    observationCount: number;
    avgImportance: number;
    submissionCount: number;
  }>;
}

@Injectable()
export class LearningInsightService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService
  ) {}

  /**
   * Generate personalised learning insights for a single student.
   *
   * When ARK_API_KEY is configured, uses the LLM to produce rich insights.
   * Otherwise falls back to rule-based insights derived from memory statistics.
   */
  async getStudentInsights(studentId: string): Promise<StudentInsight> {
    const data = await this.collectStudentMemoryData(studentId);

    if (isArkConfigured()) {
      try {
        const result = await this.generateLlmStudentInsights(studentId, data);
        return { ...result, llmUsed: true };
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(`[LearningInsight] LLM call failed, using rule fallback: ${message}`);
        return { ...this.generateRuleBasedStudentInsights(data), llmUsed: false };
      }
    }

    return { ...this.generateRuleBasedStudentInsights(data), llmUsed: false };
  }

  /**
   * Generate class-level learning insights for a teacher.
   *
   * When ARK_API_KEY is configured, uses the LLM to produce rich insights.
   * Otherwise falls back to statistics-based insights.
   */
  async getClassInsights(_teacherId: string): Promise<ClassInsight> {
    const data = await this.collectClassMemoryData();

    if (isArkConfigured()) {
      try {
        const result = await this.generateLlmClassInsights(data);
        return { ...result, llmUsed: true };
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(`[LearningInsight] LLM call failed, using rule fallback: ${message}`);
        return { ...this.generateRuleBasedClassInsights(data), llmUsed: false };
      }
    }

    return { ...this.generateRuleBasedClassInsights(data), llmUsed: false };
  }

  // -----------------------------------------------------------------------
  //  Data collection
  // -----------------------------------------------------------------------

  private async collectStudentMemoryData(
    studentId: string
  ): Promise<StudentMemoryData> {
    const [reflections, observations, submissions] = await Promise.all([
      this.prisma.agentMemory.findMany({
        where: { studentId, type: "reflection" },
        orderBy: { createdAt: "desc" },
        take: 20,
        select: { content: true, importance: true }
      }),
      this.prisma.agentMemory.findMany({
        where: { studentId, type: "observation" },
        orderBy: { createdAt: "desc" },
        take: 30,
        select: { content: true, importance: true }
      }),
      this.prisma.agentSubmission.count({
        where: { studentId }
      })
    ]);

    const allMemories = [...reflections, ...observations];
    const avgImportance =
      allMemories.length > 0
        ? allMemories.reduce((sum, m) => sum + m.importance, 0) /
          allMemories.length
        : 0;

    return {
      reflections: reflections.map((m) => m.content),
      observations: observations.map((m) => m.content),
      submissionCount: submissions,
      avgImportance
    };
  }

  private async collectClassMemoryData(): Promise<ClassMemoryData> {
    const students = await this.prisma.user.findMany({
      where: { role: "student" },
      select: { id: true, displayName: true }
    });

    const studentIds = students.map((s) => s.id);

    // Batch queries: 3 queries for ALL students instead of 3*N
    const [allReflections, allObservations, allSubmissionCounts] =
      await Promise.all([
        this.prisma.agentMemory.findMany({
          where: { studentId: { in: studentIds }, type: "reflection" },
          orderBy: { createdAt: "desc" },
          select: { studentId: true, content: true, importance: true }
        }),
        this.prisma.agentMemory.findMany({
          where: { studentId: { in: studentIds }, type: "observation" },
          orderBy: { createdAt: "desc" },
          select: { studentId: true, content: true, importance: true }
        }),
        this.prisma.agentSubmission.groupBy({
          by: ["studentId"],
          where: { studentId: { in: studentIds } },
          _count: { id: true }
        })
      ]);

    // Group results by studentId in memory
    const reflectionsByStudent = this.groupBy(allReflections, "studentId");
    const observationsByStudent = this.groupBy(allObservations, "studentId");
    const countsByStudent = new Map(
      allSubmissionCounts.map((s) => [s.studentId, s._count.id])
    );

    const studentSummaries: ClassMemoryData["studentSummaries"] = [];
    const totalReflections: string[] = [];
    const totalObservations: string[] = [];

    for (const student of students) {
      const reflections = (reflectionsByStudent.get(student.id) ?? []).slice(0, 10);
      const observations = (observationsByStudent.get(student.id) ?? []).slice(0, 10);
      const submissionCount = countsByStudent.get(student.id) ?? 0;

      const allMemories = [...reflections, ...observations];
      const avgImportance =
        allMemories.length > 0
          ? allMemories.reduce((sum, m) => sum + m.importance, 0) /
            allMemories.length
          : 0;

      studentSummaries.push({
        studentId: student.id,
        displayName: student.displayName,
        reflectionCount: reflections.length,
        observationCount: observations.length,
        avgImportance,
        submissionCount
      });

      totalReflections.push(...reflections.map((m) => m.content));
      totalObservations.push(...observations.map((m) => m.content));
    }

    return {
      totalStudents: students.length,
      totalReflections: totalReflections.slice(0, 30),
      totalObservations: totalObservations.slice(0, 30),
      studentSummaries
    };
  }

  private groupBy<T extends Record<string, unknown>>(
    items: T[],
    key: keyof T
  ): Map<string, T[]> {
    const map = new Map<string, T[]>();
    for (const item of items) {
      const k = String(item[key]);
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(item);
    }
    return map;
  }

  // -----------------------------------------------------------------------
  //  LLM-based insights
  // -----------------------------------------------------------------------

  private async generateLlmStudentInsights(
    studentId: string,
    data: StudentMemoryData
  ): Promise<Omit<StudentInsight, 'llmUsed'>> {
    const memoryContext = [
      ...data.reflections.map((r) => `[反思] ${r}`),
      ...data.observations.map((o) => `[观察] ${o}`)
    ].join("\n");

    const prompt = `基于以下学生的学习记忆数据，生成个性化学习洞察。

学生ID: ${studentId}
提交次数: ${data.submissionCount}
平均重要性: ${data.avgImportance.toFixed(1)}

记忆内容:
${memoryContext}

请以严格JSON格式返回，不要包含其他文本：
{
  "strengths": ["强项1", "强项2"],
  "weaknesses": ["待改进1"],
  "recommendations": ["建议1", "建议2"],
  "nextQuestSuggestion": "下一关推荐说明"
}`;

    const result = await chat([
      {
        role: "system",
        content:
          "你是学习分析专家。请基于学生的记忆数据生成结构化的学习洞察。必须返回有效JSON。"
      },
      { role: "user", content: prompt }
    ]);

    return this.parseStudentInsightJson(result, data);
  }

  private async generateLlmClassInsights(
    data: ClassMemoryData
  ): Promise<Omit<ClassInsight, 'llmUsed'>> {
    const studentSummariesText = data.studentSummaries
      .map(
        (s) =>
          `- ${s.displayName}: 反思${s.reflectionCount}条, 观察${s.observationCount}条, 提交${s.submissionCount}次, 平均重要性${s.avgImportance.toFixed(1)}`
      )
      .join("\n");

    const memoryContext = [
      ...data.totalReflections.map((r) => `[反思] ${r}`),
      ...data.totalObservations.map((o) => `[观察] ${o}`)
    ].join("\n");

    const prompt = `基于以下班级学情数据，生成班级层面学习洞察。

班级总人数: ${data.totalStudents}

学生概况:
${studentSummariesText}

记忆摘要:
${memoryContext}

请以严格JSON格式返回，不要包含其他文本：
{
  "commonIssues": ["普遍问题1", "普遍问题2"],
  "topPerformers": ["表现突出学生1"],
  "needsAttention": ["需关注学生1"],
  "classProgress": "班级整体进度说明"
}`;

    const result = await chat([
      {
        role: "system",
        content:
          "你是教学分析专家。请基于班级学情数据生成结构化的班级洞察。必须返回有效JSON。"
      },
      { role: "user", content: prompt }
    ]);

    return this.parseClassInsightJson(result, data);
  }

  // -----------------------------------------------------------------------
  //  Rule-based fallback insights
  // -----------------------------------------------------------------------

  private generateRuleBasedStudentInsights(
    data: StudentMemoryData
  ): Omit<StudentInsight, 'llmUsed'> {
    const strengths: string[] = [];
    const weaknesses: string[] = [];
    const recommendations: string[] = [];

    // Derive insights from reflection content
    if (data.reflections.length >= 3) {
      strengths.push("反思能力强，已积累多条学习反思");
    }

    if (data.avgImportance >= 7) {
      strengths.push("学习事件重要性高，深度学习活跃");
    }

    if (data.submissionCount >= 3) {
      strengths.push("Agent 调试能力突出，提交次数充足");
    }

    if (data.observations.length < 5) {
      weaknesses.push("学习观察记录较少，需增加日常学习记录");
    }

    if (data.avgImportance < 4 && data.observations.length > 0) {
      weaknesses.push("提交格式需规范化，学习深度有待提升");
    }

    if (data.reflections.length === 0) {
      weaknesses.push("尚未生成学习反思，缺乏自我总结");
    }

    if (data.observations.length < 10) {
      recommendations.push("建议增加日常学习观察记录，积累更多学习数据");
    }

    if (data.reflections.length < 3) {
      recommendations.push("建议复习 Day3 的结构化摘要，加强反思训练");
    }

    if (data.submissionCount < 2) {
      recommendations.push("建议多参与 Agent 实践，提升动手能力");
    }

    if (recommendations.length === 0) {
      recommendations.push("继续保持当前学习节奏，挑战更高难度任务");
    }

    const nextQuestSuggestion =
      data.submissionCount >= 3
        ? "建议挑战 Day2 的 Prompt Iteration 进阶任务"
        : "建议继续完成 Day1 的基础任务，巩固 Agent 基础";

    return {
      strengths: strengths.length > 0 ? strengths : ["学习活动已启动"],
      weaknesses: weaknesses.length > 0 ? weaknesses : ["暂无明显短板"],
      recommendations:
        recommendations.length > 0
          ? recommendations
          : ["保持当前学习节奏"],
      nextQuestSuggestion
    };
  }

  private generateRuleBasedClassInsights(
    data: ClassMemoryData
  ): Omit<ClassInsight, 'llmUsed'> {
    const commonIssues: string[] = [];
    const topPerformers: string[] = [];
    const needsAttention: string[] = [];

    // Sort students by composite score
    const sorted = [...data.studentSummaries].sort((a, b) => {
      const scoreA =
        a.reflectionCount * 2 + a.observationCount + a.submissionCount * 3;
      const scoreB =
        b.reflectionCount * 2 + b.observationCount + b.submissionCount * 3;
      return scoreB - scoreA;
    });

    // Top performers — top 30% or at least 1
    const topCount = Math.max(1, Math.ceil(sorted.length * 0.3));
    for (const student of sorted.slice(0, topCount)) {
      if (student.submissionCount > 0 || student.reflectionCount > 0) {
        topPerformers.push(
          `${student.displayName}（提交${student.submissionCount}次，反思${student.reflectionCount}条）`
        );
      }
    }

    // Needs attention — bottom 30% or students with no activity
    const bottomCount = Math.max(1, Math.ceil(sorted.length * 0.3));
    for (const student of sorted.slice(-bottomCount)) {
      if (student.submissionCount === 0 && student.observationCount === 0) {
        needsAttention.push(
          `${student.displayName}（无学习记录，需重点关注）`
        );
      } else if (student.avgImportance < 4) {
        needsAttention.push(
          `${student.displayName}（学习深度不足，平均重要性${student.avgImportance.toFixed(1)}）`
        );
      }
    }

    // Common issues
    const lowReflectionCount = data.studentSummaries.filter(
      (s) => s.reflectionCount === 0
    ).length;

    if (lowReflectionCount > data.totalStudents * 0.5) {
      commonIssues.push("Day1 普遍存在反思不足问题，多数学生未生成学习反思");
    }

    const lowSubmissionCount = data.studentSummaries.filter(
      (s) => s.submissionCount === 0
    ).length;

    if (lowSubmissionCount > 0) {
      commonIssues.push(`Day4 普遍存在格式问题，${lowSubmissionCount}名学生尚未提交任务`);
    }

    const avgClassImportance =
      data.studentSummaries.length > 0
        ? data.studentSummaries.reduce((sum, s) => sum + s.avgImportance, 0) /
          data.studentSummaries.length
        : 0;

    if (avgClassImportance < 5) {
      commonIssues.push("班级整体学习深度偏低，平均重要性不足5分");
    }

    if (commonIssues.length === 0) {
      commonIssues.push("暂无明显普遍问题");
    }

    const totalSubmissions = data.studentSummaries.reduce(
      (sum, s) => sum + s.submissionCount,
      0
    );

    const classProgress = `班级共${data.totalStudents}名学生，累计提交${totalSubmissions}次，平均重要性${avgClassImportance.toFixed(1)}。整体进度${totalSubmissions >= data.totalStudents * 2 ? "良好" : "需加速"}。`;

    return {
      commonIssues,
      topPerformers: topPerformers.length > 0 ? topPerformers : ["暂无突出表现"],
      needsAttention:
        needsAttention.length > 0 ? needsAttention : ["暂无特别需关注学生"],
      classProgress
    };
  }

  // -----------------------------------------------------------------------
  //  JSON parsing helpers
  // -----------------------------------------------------------------------

  private parseStudentInsightJson(
    raw: string,
    fallbackData: StudentMemoryData
  ): Omit<StudentInsight, 'llmUsed'> {
    try {
      const parsed = JSON.parse(this.extractJson(raw));
      return {
        strengths: Array.isArray(parsed.strengths)
          ? parsed.strengths
          : ["学习洞察已生成"],
        weaknesses: Array.isArray(parsed.weaknesses)
          ? parsed.weaknesses
          : ["暂无明显短板"],
        recommendations: Array.isArray(parsed.recommendations)
          ? parsed.recommendations
          : ["保持当前学习节奏"],
        nextQuestSuggestion:
          typeof parsed.nextQuestSuggestion === "string" &&
          parsed.nextQuestSuggestion.length > 0
            ? parsed.nextQuestSuggestion
            : "继续完成当前任务"
      };
    } catch {
      return this.generateRuleBasedStudentInsights(fallbackData);
    }
  }

  private parseClassInsightJson(
    raw: string,
    fallbackData: ClassMemoryData
  ): Omit<ClassInsight, 'llmUsed'> {
    try {
      const parsed = JSON.parse(this.extractJson(raw));
      return {
        commonIssues: Array.isArray(parsed.commonIssues)
          ? parsed.commonIssues
          : ["暂无明显普遍问题"],
        topPerformers: Array.isArray(parsed.topPerformers)
          ? parsed.topPerformers
          : ["暂无突出表现"],
        needsAttention: Array.isArray(parsed.needsAttention)
          ? parsed.needsAttention
          : ["暂无特别需关注学生"],
        classProgress:
          typeof parsed.classProgress === "string" &&
          parsed.classProgress.length > 0
            ? parsed.classProgress
            : "班级学情已生成"
      };
    } catch {
      return this.generateRuleBasedClassInsights(fallbackData);
    }
  }

  private extractJson(text: string): string {
    // Try to extract JSON from markdown code blocks or plain text
    const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) {
      return codeBlockMatch[1].trim();
    }

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return jsonMatch[0];
    }

    return text.trim();
  }
}
