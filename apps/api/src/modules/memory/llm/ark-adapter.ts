import OpenAI from "openai";
import { Logger } from "@nestjs/common";

const logger = new Logger("ARK");

let arkClient: OpenAI | undefined;

function getArkClient() {
  const apiKey = process.env.ARK_API_KEY;
  if (!apiKey) {
    throw new Error("ARK_API_KEY is not configured");
  }

  // Create the SDK client only when an LLM call is really requested. This
  // keeps the documented rule-based fallback usable in deployments without
  // an ARK credential.
  arkClient ??= new OpenAI({
    baseURL: process.env.ARK_BASE_URL || "https://ark.cn-beijing.volces.com/api/v3",
    apiKey,
    timeout: 30000,
  });
  return arkClient;
}

const ARK_MODEL =
  process.env.ARK_MODEL || "doubao-seed-2-1-turbo-260628";

export function isArkConfigured(): boolean {
  return !!process.env.ARK_API_KEY;
}

export async function chat(
  messages: OpenAI.ChatCompletionMessageParam[]
): Promise<string> {
  const start = Date.now();
  try {
    const response = await getArkClient().chat.completions.create({
      model: ARK_MODEL,
      messages
    });
    const elapsed = Date.now() - start;
    const usage = response.usage
      ? `prompt=${response.usage.prompt_tokens}, completion=${response.usage.completion_tokens}`
      : "N/A";
    logger.log(`[ARK] LLM call succeeded (model=${ARK_MODEL}, ${elapsed}ms, tokens=${usage})`);
    return response.choices[0].message.content || "";
  } catch (error: unknown) {
    const elapsed = Date.now() - start;
    const message = error instanceof Error ? error.message : String(error);
    logger.warn(`[ARK] LLM call failed (model=${ARK_MODEL}, ${elapsed}ms): ${message}`);
    throw error;
  }
}

export async function chatMultimodal(
  imageUrl: string,
  text: string
): Promise<string> {
  const start = Date.now();
  try {
    const response = await getArkClient().chat.completions.create({
      model: ARK_MODEL,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text },
            { type: "image_url", image_url: { url: imageUrl } }
          ]
        }
      ]
    });
    const elapsed = Date.now() - start;
    const usage = response.usage
      ? `prompt=${response.usage.prompt_tokens}, completion=${response.usage.completion_tokens}`
      : "N/A";
    logger.log(`[ARK] LLM multimodal call succeeded (model=${ARK_MODEL}, ${elapsed}ms, tokens=${usage})`);
    return response.choices[0].message.content || "";
  } catch (error: unknown) {
    const elapsed = Date.now() - start;
    const message = error instanceof Error ? error.message : String(error);
    logger.warn(`[ARK] LLM multimodal call failed (model=${ARK_MODEL}, ${elapsed}ms): ${message}`);
    throw error;
  }
}

export async function scoreImportance(content: string): Promise<number> {
  if (!isArkConfigured()) {
    return 5.0;
  }
  try {
    const result = await chat([
      {
        role: "system",
        content:
          "你是一个教学事件重要性评估器。请给以下事件打分(1-10)，1=日常闲聊，10=重大学习突破。只返回数字。"
      },
      { role: "user", content }
    ]);
    const score = Math.min(10, Math.max(1, parseInt(result.trim(), 10) || 5));
    return score;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn(`[ARK] scoreImportance LLM call failed, using rule fallback: ${message}`);
    return 5.0;
  }
}

export async function generateReflections(
  memories: string[],
  focalPoints: string[]
): Promise<string[]> {
  if (!isArkConfigured()) {
    return [];
  }
  try {
    const prompt = `基于以下学习记忆，围绕焦点"${focalPoints.join(", ")}"，生成5条高层学习洞察：\n\n记忆：\n${memories.join("\n")}`;
    const result = await chat([
      {
        role: "system",
        content:
          "你是学习反思生成器。请基于学生记忆生成简洁的学习洞察，每条一行。"
      },
      { role: "user", content: prompt }
    ]);
    return result
      .split("\n")
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
      .slice(0, 5);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn(`[ARK] generateReflections LLM call failed, using rule fallback: ${message}`);
    return [];
  }
}
