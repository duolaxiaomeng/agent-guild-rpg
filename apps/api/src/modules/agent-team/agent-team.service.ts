import { Injectable, NotFoundException } from "@nestjs/common";
import {
  AGENT_TEAM_ROLE_DIRECTORY,
  GLOBAL_AGENT_TEAM_ROLE_KEYS,
  type GlobalAgentTeamRoleKey,
} from "./agent-team.catalog";
import {
  TEACHING_AGENT_ROLES,
  type AgentRoleKey,
} from "../memory/teaching-agents/agent-roles";

const DEFAULT_MODEL = "doubao-seed-2-1-turbo-260628";
const DEFAULT_ADAPTER = "ark";

export interface AgentTeamRole {
  roleKey: GlobalAgentTeamRoleKey;
  name: string;
  description: string;
  capabilities: string[];
  defaultModel: string;
  adapter: string;
  parallelResponsibilities: string[];
}

export interface AgentTeamCatalog {
  roles: AgentTeamRole[];
}

@Injectable()
export class AgentTeamService {
  getCatalog(): AgentTeamCatalog {
    return {
      roles: GLOBAL_AGENT_TEAM_ROLE_KEYS.map((roleKey) => this.toRole(roleKey)),
    };
  }

  getRole(roleKey: string): AgentTeamRole {
    if (
      !GLOBAL_AGENT_TEAM_ROLE_KEYS.includes(
        roleKey as GlobalAgentTeamRoleKey,
      )
    ) {
      throw new NotFoundException(`Agent role not found: ${roleKey}`);
    }

    return this.toRole(roleKey as GlobalAgentTeamRoleKey);
  }

  private toRole(roleKey: GlobalAgentTeamRoleKey): AgentTeamRole {
    const directoryRole = AGENT_TEAM_ROLE_DIRECTORY[roleKey];
    const legacyRole = this.getLegacyRole(roleKey);

    return {
      roleKey,
      name: legacyRole?.name ?? directoryRole.name,
      description: legacyRole?.role ?? directoryRole.description,
      capabilities: [...directoryRole.capabilities],
      defaultModel: DEFAULT_MODEL,
      adapter: DEFAULT_ADAPTER,
      parallelResponsibilities: [...directoryRole.parallelResponsibilities],
    };
  }

  private getLegacyRole(roleKey: GlobalAgentTeamRoleKey) {
    if (!Object.prototype.hasOwnProperty.call(TEACHING_AGENT_ROLES, roleKey)) {
      return undefined;
    }

    return TEACHING_AGENT_ROLES[roleKey as AgentRoleKey];
  }
}
