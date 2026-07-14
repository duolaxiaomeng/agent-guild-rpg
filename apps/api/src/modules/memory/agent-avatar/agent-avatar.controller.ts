import {
  BadRequestException,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { AuthGuard } from "../../auth/auth.guard";
import { AgentAvatarService } from "./agent-avatar.service";

@ApiTags("agent-avatars")
@ApiBearerAuth()
@Controller("agent-avatars")
@UseGuards(AuthGuard)
export class AgentAvatarController {
  constructor(
    @Inject(AgentAvatarService)
    private readonly avatarService: AgentAvatarService
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
