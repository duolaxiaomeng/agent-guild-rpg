import { Inject, Injectable } from "@nestjs/common";
import type OpenAI from "openai";
import { PrismaService } from "../../prisma/prisma.service";
import { MemoryService } from "./memory.service";
import { getPersona, type NpcPersona } from "./npc-personas";
import { chat, isArkConfigured } from "./llm/ark-adapter";

export type NpcConversationResult = {
  npcId: string;
  npcName: string;
  reply: string;
  degraded: boolean;
  llmUsed: boolean;
};

@Injectable()
export class NpcConversationService {
  constructor(
    @Inject(MemoryService) private readonly memoryService: MemoryService,
    @Inject(PrismaService) private readonly prisma: PrismaService,
  ) {}

  /**
   * Generate a conversational reply for an NPC.
   *
   * - If `userMessage` is empty/undefined, the NPC produces a greeting.
   * - If `studentId` is provided, the NPC's memory stream is retrieved
   *   and included in the LLM context for personalization.
   * - If `ARK_API_KEY` is not set, a static fallback reply is returned
   *   without calling the LLM (graceful degradation).
   * - The conversation is recorded into the NPC's memory stream via
   *   `MemoryService.observe` so future interactions can reference it.
   */
  async getConversation(
    npcId: string,
    studentId?: string,
    userMessage?: string,
  ): Promise<NpcConversationResult> {
    // Unknown IDs use the default persona so the world can introduce new
    // conversational actors without requiring an API/server deploy first.
    const persona = getPersona(npcId);
    const hasMessage =
      userMessage !== undefined && userMessage.trim().length > 0;

    // ---- Graceful degradation: no API key ----
    if (!isArkConfigured()) {
      const reply = hasMessage
        ? persona.fallbackReply
        : persona.greetingTemplate;
      return {
        npcId,
        npcName: persona.name,
        reply,
        degraded: true,
        llmUsed: false,
      };
    }

    // ---- Build LLM messages ----
    const memoryContext = await this.retrieveMemoryContext(
      npcId,
      studentId,
      userMessage ?? "",
    );

    const messages = this.buildLlmMessages(
      persona,
      memoryContext,
      userMessage,
    );

    // ---- Call LLM ----
    let reply: string;
    let llmUsed = false;
    try {
      reply = await chat(messages);
      reply = reply.trim() || persona.fallbackReply;
      llmUsed = reply !== persona.fallbackReply;
    } catch (error: unknown) {
      // LLM call failed — fall back to static reply
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[NPC] LLM call failed for ${npcId}, using persona fallback: ${message}`);
      reply = hasMessage ? persona.fallbackReply : persona.greetingTemplate;
    }

    // ---- Persist conversation to NPC's memory stream ----
    if (studentId) {
      try {
        const npcStudentId = `npc:${npcId}`;
        // Ensure the NPC virtual user exists to satisfy FK constraint
        await this.prisma.user.upsert({
          where: { id: npcStudentId },
          update: {},
          create: {
            id: npcStudentId,
            role: "student",
            email: `npc-${npcId}@npc.local`,
            passwordHash: "npc-virtual-user-no-login",
            displayName: persona.name,
            isOnline: true,
          },
        });
        const observeContent = hasMessage
          ? `学生${studentId}对${persona.name}说: ${userMessage} | ${persona.name}回复: ${reply}`
          : `学生${studentId}与${persona.name}开始对话。${persona.name}说: ${reply}`;
        await this.memoryService.observe(
          npcStudentId,
          "observation",
          observeContent,
          3.0,
          "npc"
        );
      } catch {
        // Memory persistence failure should not break the conversation
      }
    }

    return {
      npcId,
      npcName: persona.name,
      reply,
      degraded: false,
      llmUsed,
    };
  }

  /**
   * Retrieve relevant memories for the NPC, optionally scoped to a student.
   */
  private async retrieveMemoryContext(
    npcId: string,
    studentId: string | undefined,
    query: string,
  ): Promise<string> {
    const npcStudentId = `npc:${npcId}`;
    const retrievalQuery = query || personaContextQuery(npcId);

    try {
      const memories = await this.memoryService.retrieve(
        npcStudentId,
        retrievalQuery,
        5,
      );

      if (memories.length === 0) {
        return "";
      }

      const memoryLines = memories.map(
        (m) => `- ${m.content}`,
      );

      return `\n\n最近的记忆:\n${memoryLines.join("\n")}`;
    } catch {
      return "";
    }
  }

  /**
   * Build the OpenAI chat messages array for the LLM call.
   */
  private buildLlmMessages(
    persona: NpcPersona,
    memoryContext: string,
    userMessage: string | undefined,
  ): OpenAI.ChatCompletionMessageParam[] {
    const systemPrompt = [
      `你是${persona.name}，${persona.role}。`,
      `性格: ${persona.personality}。`,
      `背景: ${persona.background}。`,
      `你目前在「${persona.zone}」区域。`,
      `请用符合角色设定的语气回复，保持简洁（不超过100字）。`,
      `不要透露你是AI或语言模型，始终以NPC身份说话。`,
      `不要编造学生进度、任务状态、评分、权限或实时 Agent 状态；这些信息只能以系统真实数据为准。`,
      `遇到超出角色职责或无法确认的信息时，请明确说明，并引导用户查看系统页面或联系对应工作人员。`,
    ].join("\n");

    const hasMessage =
      userMessage !== undefined && userMessage.trim().length > 0;

    const messages: OpenAI.ChatCompletionMessageParam[] = [
      { role: "system", content: systemPrompt + memoryContext },
    ];

    if (hasMessage) {
      messages.push({ role: "user", content: userMessage! });
    } else {
      messages.push({
        role: "user",
        content: "请向我打招呼，简短介绍你的角色和当前区域的情况。",
      });
    }

    return messages;
  }
}

function personaContextQuery(npcId: string): string {
  const persona = getPersona(npcId);
  return `${persona.name} ${persona.role} ${persona.zone}`;
}
