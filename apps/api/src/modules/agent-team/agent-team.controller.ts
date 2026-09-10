import {
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Put,
  Body,
  UseGuards,
} from "@nestjs/common";
import { IsString } from "class-validator";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { AuthGuard } from "../auth/auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import {
  type AgentTeamActor,
  AgentTeamService,
  type AgentTeamCatalog,
  type AgentTeamRole,
} from "./agent-team.service";

class SetAgentTeamBindingDto {
  @IsString()
  roleKey!: string;
}

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

  @ApiOperation({ summary: "获取当前学生的 Agent 战队身份" })
  @Get("me")
  async getMyBinding(@CurrentUser() user: AgentTeamActor) {
    return { binding: await this.agentTeamService.getMyBinding(user) };
  }

  @ApiOperation({ summary: "绑定或更换当前学生的 Agent 战队身份" })
  @Put("me")
  setMyBinding(
    @Body() body: SetAgentTeamBindingDto,
    @CurrentUser() user: AgentTeamActor,
  ) {
    return this.agentTeamService.setMyBinding(user, body.roleKey);
  }

  @ApiOperation({ summary: "解除当前学生的 Agent 战队身份" })
  @Delete("me")
  clearMyBinding(@CurrentUser() user: AgentTeamActor) {
    return this.agentTeamService.clearMyBinding(user);
  }

  @ApiOperation({
    summary: "获取在线且已绑定身份的 Agent 战队成员",
    description: "离线或未绑定身份的学生不会出现在战队大厅",
  })
  @Get("roster")
  getOnlineRoster() {
    return this.agentTeamService.getOnlineRoster();
  }

  @ApiOperation({ summary: "获取单个 Agent 战队角色" })
  @Get("roles/:roleKey")
  getRole(@Param("roleKey") roleKey: string): AgentTeamRole {
    return this.agentTeamService.getRole(roleKey);
  }
}
