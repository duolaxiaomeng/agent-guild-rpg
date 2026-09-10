import { GLOBAL_AGENT_TEAM_ROLE_KEYS, type GlobalAgentTeamRoleKey } from "./agent-team.catalog";

export type AgentVisualRole = "browser" | "coder" | "files" | "ops" | "lead";

export const AGENT_VISUAL_ROLE_BY_KEY: Record<GlobalAgentTeamRoleKey, AgentVisualRole> = {
  ta: "browser",
  mentor: "browser",
  reviewer: "files",
  qa: "files",
  "software-architect": "coder",
  "frontend-developer": "coder",
  "backend-developer": "coder",
  "deployment-release": "ops",
  "operations-architect": "ops",
  "philosophy-design-mentor": "lead",
};

export function isGlobalAgentTeamRoleKey(value: string): value is GlobalAgentTeamRoleKey {
  return GLOBAL_AGENT_TEAM_ROLE_KEYS.includes(value as GlobalAgentTeamRoleKey);
}

export function resolveAgentVisualRole(roleKey: string): AgentVisualRole | null {
  return isGlobalAgentTeamRoleKey(roleKey) ? AGENT_VISUAL_ROLE_BY_KEY[roleKey] : null;
}
