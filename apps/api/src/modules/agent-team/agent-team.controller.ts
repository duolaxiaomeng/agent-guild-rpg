import {
  Controller,
  Get,
  Inject,
  Param,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { AuthGuard } from "../auth/auth.guard";
import {
  AgentTeamService,
  type AgentTeamCatalog,
  type AgentTeamRole,
} from "./agent-team.service";

@ApiTags("agent-team")
@ApiBearerAuth()
@Controller("agent-team")
@UseGuards(AuthGuard)
export class AgentTeamController {
  constructor(
    @Inject(AgentTeamService)
    private readonly agentTeamService: AgentTeamService,
  ) {}

  @ApiOperation({
    summary: "获取 Agent 战队角色目录",
    description: "返回教学 Agent 角色、能力、模型适配器和可并发职责",
  })
  @Get("catalog")
  getCatalog(): AgentTeamCatalog {
    return this.agentTeamService.getCatalog();
  }

  @ApiOperation({ summary: "获取单个 Agent 战队角色" })
  @Get("roles/:roleKey")
  getRole(@Param("roleKey") roleKey: string): AgentTeamRole {
    return this.agentTeamService.getRole(roleKey);
  }
}
