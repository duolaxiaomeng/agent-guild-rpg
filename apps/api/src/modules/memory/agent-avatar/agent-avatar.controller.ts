import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Put,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { IsIn } from "class-validator";
import { AuthGuard } from "../../auth/auth.guard";
import { CurrentUser } from "../../auth/current-user.decorator";
import { AgentAvatarService } from "./agent-avatar.service";
import { AgentWorldService } from "../../realtime/agent-world.service";

class MoveAgentAvatarDto {
  @IsIn(["lobby", "workstations", "collab-room", "review-station"])
  zone!: "lobby" | "workstations" | "collab-room" | "review-station";
}

@ApiTags("agent-avatars")
@ApiBearerAuth()
@Controller("agent-avatars")
@UseGuards(AuthGuard)
export class AgentAvatarController {
  constructor(
    @Inject(AgentAvatarService)
    private readonly avatarService: AgentAvatarService,
    @Inject(AgentWorldService)
    private readonly agentWorldService: AgentWorldService,
  ) {}

  /**
   * GET /agent-avatars — list all agent avatars.
   * Optional query: ?zone=workstations
   */
  @ApiOperation({
    summary: "获取所有 Agent 头像状态",
    description: "返回所有学生 Agent 的头像状态，可选按区域过滤。合法区域: lobby, workstations, collab-room, review-station",
  })
  @Get()
  async list(@Query("zone") zone?: string) {
    const validZones = new Set([
      "lobby",
      "workstations",
      "collab-room",
      "review-station",
    ]);

    if (zone && !validZones.has(zone)) {
      throw new BadRequestException(
        `Invalid zone: '${zone}'. Valid zones: lobby, workstations, collab-room, review-station.`
      );
    }

    const filterZone =
      zone && validZones.has(zone)
        ? (zone as "lobby" | "workstations" | "collab-room" | "review-station")
        : undefined;

    return this.avatarService.getAvatars(filterZone);
  }

  @ApiOperation({ summary: "移动当前使用者的 Agent 到指定区域" })
  @Put("me/zone")
  async moveMyAvatar(
    @CurrentUser() user: { id: string },
    @Body() body: MoveAgentAvatarDto,
  ) {
    const state = await this.avatarService.moveAvatar(user.id, body.zone);
    if (!state) {
      throw new NotFoundException(`Avatar for user ${user.id} not found`);
    }
    return state;
  }

  @ApiOperation({ summary: "获取当前学生的私人工位 Agent 状态" })
  @Get("me")
  async getMyAvatar(@CurrentUser() user: { id: string; role: string }) {
    const state = await this.avatarService.getAvatarState(user.id);
    if (!state) {
      throw new NotFoundException(`Avatar for user ${user.id} not found`);
    }
    const movementLockReason = await this.agentWorldService.getMovementLock(user.id);
    const position = await this.agentWorldService.getPosition(
      user.id,
      state.agentRole,
    );
    return {
      ...state,
      position,
      movementLocked: movementLockReason !== null,
      movementLockReason,
    };
  }

  /**
   * GET /agent-avatars/:studentId — get a single agent avatar state.
   */
  @ApiOperation({
    summary: "获取单个 Agent 头像状态",
    description: "返回指定学生的 Agent 头像状态信息",
  })
  @Get(":studentId")
  async getOne(@Param("studentId") studentId: string) {
    const state = await this.avatarService.getAvatarState(studentId);
    if (!state) {
      throw new NotFoundException(`Avatar for student ${studentId} not found`);
    }
    return state;
  }
}
