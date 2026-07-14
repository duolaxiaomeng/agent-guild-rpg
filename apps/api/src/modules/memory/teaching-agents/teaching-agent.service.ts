import { Injectable } from "@nestjs/common";
import type OpenAI from "openai";
import { chat, isArkConfigured } from "../llm/ark-adapter";
import { TEACHING_AGENT_ROLES, type AgentRoleKey } from "./agent-roles";

export type CollaborationMessage = {
  agentRole: AgentRoleKey;
  agentName: string;
  message: string;
  timestamp: string;
};

export type CollaborationResult = {
  topic: string;
  messages: CollaborationMessage[];
  summary: string;
  degraded: boolean;
};

/**
 * Multi-Agent collaboration coordinator.
 *
 * Inspired by AutoGen's multi-agent conversation pattern:
 * - Agents speak in sequence, each seeing all previous messages.
 * - A final summary is generated after all agents have spoken.
 * - Falls back to rule-based responses when ARK_API_KEY is not set.
 */
@Injectable()
export class TeachingAgentService {
  /**
   * Run a multi-agent collaboration on a given topic.
   *
   * @param agents   Ordered list of agent role keys to participate.
   * @param topic    The topic/question for collaboration.
   * @param context  Additional context string (e.g. submission details).
   * @returns        Collaboration result with each agent's message and a summary.
   */
  async collaborate(
    agents: AgentRoleKey[],
    topic: string,
    context?: string,
  ): Promise<CollaborationResult> {
    const degraded = !isArkConfigured();
    const messages: CollaborationMessage[] = [];
    const conversationHistory: string[] = [];

    for (const agentKey of agents) {
      const role = TEACHING_AGENT_ROLES[agentKey];
      let message: string;

      if (degraded) {
        message = this.fallbackMessage(agentKey, topic, conversationHistory);
      } else {
        try {
          message = await this.callAgent(
            role.systemPrompt,
            topic,
            context,
            conversationHistory,
          );
          if (!message || message.trim().length === 0) {
            message = this.fallbackMessage(
              agentKey,
              topic,
              conversationHistory,
            );
          }
        } catch {
          message = this.fallbackMessage(agentKey, topic, conversationHistory);
        }
      }

      messages.push({
        agentRole: agentKey,
        agentName: role.name,
        message,
        timestamp: new Date().toISOString(),
      });
      conversationHistory.push(`${role.name}: ${message}`);
    }

    // Generate summary
    let summary: string;
    if (degraded) {
      summary = this.fallbackSummary(topic, messages);
    } else {
      try {
        summary = await this.generateSummary(topic, conversationHistory);
        if (!summary || summary.trim().length === 0) {
          summary = this.fallbackSummary(topic, messages);
        }
      } catch {
        summary = this.fallbackSummary(topic, messages);
      }
    }

    return {
      topic,
      messages,
      summary,
      degraded,
    };
  }

  private async callAgent(
    systemPrompt: string,
    topic: string,
    context: string | undefined,
    history: string[],
  ): Promise<string> {
    const historyText =
      history.length > 0
        ? `\n\n之前的对话:\n${history.map((h) => `- ${h}`).join("\n")}`
        : "";

    const contextText = context ? `\n\n背景信息:\n${context}` : "";

    const messages: OpenAI.ChatCompletionMessageParam[] = [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: `讨论主题: ${topic}${contextText}${historyText}\n\n请发表你的观点（不超过200字）。`,
      },
    ];

    return chat(messages);
  }

  private async generateSummary(
    topic: string,
    history: string[],
  ): Promise<string> {
    const messages: OpenAI.ChatCompletionMessageParam[] = [
      {
        role: "system",
        content:
          "你是一个讨论总结器。请基于多Agent的讨论，生成简洁的总结。",
      },
      {
        role: "user",
        content: `讨论主题: ${topic}\n\n讨论记录:\n${history.map((h) => `- ${h}`).join("\n")}\n\n请生成一段总结。`,
      },
    ];

    return chat(messages);
  }

  private fallbackMessage(
    agentKey: AgentRoleKey,
    topic: string,
    _history: string[],
  ): string {
    const templates: Record<AgentRoleKey, string> = {
      ta: `作为助教，关于"${topic}"，我认为应该从基础概念入手，帮助学生建立清晰的理解框架。`,
      reviewer: `作为评审员，关于"${topic}"，我建议按照标准进行评估，关注完整性和质量。`,
      mentor: `作为导师，关于"${topic}"，我建议深入理解原理，并结合实例进行学习。`,
    };
    return templates[agentKey];
  }

  private fallbackSummary(
    topic: string,
    messages: CollaborationMessage[],
  ): string {
    const agentNames = messages.map((m) => m.agentName).join("、");
    return `关于"${topic}"的讨论已完成，参与Agent: ${agentNames}。` +
      `各方从不同角度提供了见解，建议综合参考各方意见。`;
  }
}
