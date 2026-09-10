import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { AgentAvatarService, type AvatarState } from "../memory/agent-avatar/agent-avatar.service";
import {
  AGENT_TEAM_ROLE_DIRECTORY,
  GLOBAL_AGENT_TEAM_ROLE_KEYS,
  type GlobalAgentTeamRoleKey,
} from "./agent-team.catalog";
import {
  isGlobalAgentTeamRoleKey,
  resolveAgentVisualRole,
  type AgentVisualRole,
} from "./agent-team.mapping";
import {
  TEACHING_AGENT_ROLES,
  type AgentRoleKey,
} from "../memory/teaching-agents/agent-roles";
import { AgentWorldService } from "../realtime/agent-world.service";

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
  visualRole: AgentVisualRole;
}

export interface AgentTeamCatalog {
  roles: AgentTeamRole[];
}

export type AgentTeamActor = {
  id: string;
  role: "teacher" | "student";
};

export type AgentTeamBinding = {
  studentId: string;
  roleKey: GlobalAgentTeamRoleKey;
  visualRole: AgentVisualRole;
  updatedAt: string;
};

export type AgentTeamRosterMember = AvatarState & {
  agentRole: GlobalAgentTeamRoleKey;
  visualRole: AgentVisualRole;
};

@Injectable()
export class AgentTeamService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AgentAvatarService) private readonly avatarService: AgentAvatarService,
    @Optional() @Inject(AgentWorldService)
    private readonly agentWorldService?: AgentWorldService,
  ) {}

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

  async getMyBinding(user: AgentTeamActor): Promise<AgentTeamBinding | null> {
    if (user.role !== "student") return null;

    const binding = await this.prisma.agentTeamBinding.findUnique({
      where: { studentId: user.id },
      select: { studentId: true, roleKey: true, updatedAt: true },
    });

    return binding ? this.toBinding(binding) : null;
  }

  async setMyBinding(user: AgentTeamActor, roleKey: string): Promise<AgentTeamBinding> {
    this.assertStudent(user);
    if (!isGlobalAgentTeamRoleKey(roleKey)) {
      throw new BadRequestException(`Unknown Agent role: ${roleKey}`);
    }

    const binding = await this.prisma.agentTeamBinding.upsert({
      where: { studentId: user.id },
      create: { studentId: user.id, roleKey },
      update: { roleKey },
      select: { studentId: true, roleKey: true, updatedAt: true },
    });
    this.avatarService.invalidateCache();
    await this.agentWorldService?.resetToRoleHome(user.id, roleKey);

    return this.toBinding(binding);
  }

  async clearMyBinding(user: AgentTeamActor): Promise<{ cleared: boolean }> {
    this.assertStudent(user);
    const result = await this.prisma.agentTeamBinding.deleteMany({
      where: { studentId: user.id },
    });
    this.avatarService.invalidateCache();
    return { cleared: result.count > 0 };
  }

  async getOnlineRoster(): Promise<AgentTeamRosterMember[]> {
    const avatars = await this.avatarService.getAvatars();
    return avatars.filter(
      (avatar): avatar is AgentTeamRosterMember =>
        Boolean(avatar.agentRole && avatar.visualRole && avatar.status !== "offline"),
    );
  }

  private assertStudent(user: AgentTeamActor) {
    if (user.role !== "student") {
      throw new ForbiddenException("Only students can bind an Agent team identity");
    }
  }

  private toBinding(binding: {
    studentId: string;
    roleKey: string;
    updatedAt: Date;
  }): AgentTeamBinding {
    const visualRole = resolveAgentVisualRole(binding.roleKey);
    if (!isGlobalAgentTeamRoleKey(binding.roleKey) || !visualRole) {
      throw new BadRequestException(`Invalid stored Agent role: ${binding.roleKey}`);
    }
    return {
      studentId: binding.studentId,
      roleKey: binding.roleKey,
      visualRole,
      updatedAt: binding.updatedAt.toISOString(),
    };
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
      visualRole: resolveAgentVisualRole(roleKey)!,
    };
  }

  private getLegacyRole(roleKey: GlobalAgentTeamRoleKey) {
    if (!Object.prototype.hasOwnProperty.call(TEACHING_AGENT_ROLES, roleKey)) {
      return undefined;
    }

    return TEACHING_AGENT_ROLES[roleKey as AgentRoleKey];
  }
}
