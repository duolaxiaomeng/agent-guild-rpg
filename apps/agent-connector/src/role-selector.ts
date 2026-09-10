import {
  INITIAL_WORKSTATION_ROLE_KEYS,
  initialWorkstationRoleSchema,
  type InitialWorkstationRole,
} from "contracts";
import { ProviderProcessAdapter } from "./adapters/provider-process-adapter.js";

const ROLE_SELECTION_TIMEOUT_MS = 60_000;
const ROLE_SELECTION_MAX_OUTPUT = 4_096;
const ROLE_SELECTION_ATTEMPTS = 2;

const ROLE_DESCRIPTIONS: Record<InitialWorkstationRole, string> = {
  ta: "Browser：检索、阅读、学习辅导与资料整理",
  "frontend-developer": "Coder：前端实现、交互开发与界面调试",
  qa: "Files：测试设计、证据核对、边界检查与回归验证",
  "deployment-release": "Ops：构建、部署、发布与环境排障",
};

export type RoleSelectionRun = (
  instruction: string,
  attempt: number,
) => Promise<{ succeeded: boolean; output: string }>;

export type SelectAgentRoleOptions = {
  provider: string;
  workspaceRoot: string;
  override?: string;
  fallback?: InitialWorkstationRole;
  onFallback?: (reason: string) => void;
  executable?: string;
  allowedExecutables?: readonly string[];
  timeoutMs?: number;
  sensitiveValues?: readonly string[];
  run?: RoleSelectionRun;
};

export async function selectAgentRole(
  options: SelectAgentRoleOptions,
): Promise<InitialWorkstationRole> {
  const override = options.override?.trim();
  if (override) {
    const parsed = initialWorkstationRoleSchema.safeParse(override);
    if (!parsed.success) {
      throw new Error(
        `AGENT_GUILD_ROLE_KEY must be one of: ${INITIAL_WORKSTATION_ROLE_KEYS.join(", ")}`,
      );
    }
    return parsed.data;
  }

  const run = options.run ?? createProviderRunner(options);
  let lastError = "model did not return a valid role";
  for (let attempt = 1; attempt <= ROLE_SELECTION_ATTEMPTS; attempt += 1) {
    try {
      const result = await run(buildRoleSelectionPrompt(), attempt);
      if (!result.succeeded) {
        lastError = "role-selection provider process failed";
        continue;
      }
      return parseRoleSelectionOutput(result.output);
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
  }

  if (options.fallback) {
    options.onFallback?.(lastError);
    return options.fallback;
  }

  throw new Error(
    `Agent role selection failed after ${ROLE_SELECTION_ATTEMPTS} attempts: ${lastError}`,
  );
}

export function parseRoleSelectionOutput(output: string): InitialWorkstationRole {
  let value: unknown;
  try {
    value = JSON.parse(output.trim());
  } catch {
    throw new Error("model output must be one strict JSON object");
  }
  if (
    !value
    || typeof value !== "object"
    || Array.isArray(value)
    || Object.keys(value).length !== 1
    || !("roleKey" in value)
  ) {
    throw new Error("model output must contain only roleKey");
  }
  const parsed = initialWorkstationRoleSchema.safeParse(
    (value as { roleKey: unknown }).roleKey,
  );
  if (!parsed.success) {
    throw new Error("model output contains an unsupported roleKey");
  }
  return parsed.data;
}

function buildRoleSelectionPrompt() {
  const choices = INITIAL_WORKSTATION_ROLE_KEYS.map(
    (roleKey) => `- ${roleKey}: ${ROLE_DESCRIPTIONS[roleKey]}`,
  ).join("\n");
  return [
    "你正在接入教学 Agent 世界。请检查当前工作区的项目类型和你最擅长承担的职责。",
    "只能从下面四个角色中选择一个：",
    choices,
    '只输出一行严格 JSON，例如：{"roleKey":"qa"}。不要输出 Markdown 或其他解释。',
  ].join("\n");
}

function createProviderRunner(options: SelectAgentRoleOptions): RoleSelectionRun {
  const adapter = new ProviderProcessAdapter({
    workspaceRoot: options.workspaceRoot,
    provider: options.provider,
    executable: options.executable,
    allowedExecutables: options.allowedExecutables,
    timeoutMs: options.timeoutMs ?? ROLE_SELECTION_TIMEOUT_MS,
    maxOutputLength: ROLE_SELECTION_MAX_OUTPUT,
    sensitiveValues: options.sensitiveValues,
  });
  return async (instruction, attempt) => {
    const result = await adapter.run({
      runId: `role-selection-${Date.now()}-${attempt}`,
      dayId: "connector-setup",
      instruction,
    });
    return { succeeded: result.succeeded, output: result.output };
  };
}
