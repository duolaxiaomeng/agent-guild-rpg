import { Controller, Get, Inject, NotFoundException, Optional, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { AuthGuard } from "../auth/auth.guard";
import { PrismaService } from "../../prisma/prisma.service";
import { PresenceService } from "../realtime/presence.service";

@ApiTags("world")
@ApiBearerAuth()
@Controller("world")
@UseGuards(AuthGuard)
export class WorldController {
  private readonly presence: PresenceService;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Optional() @Inject(PresenceService) presence?: PresenceService
  ) {
    this.presence = presence ?? new PresenceService();
  }

  @ApiOperation({ summary: "获取游戏世界信息", description: "返回当前课程世界状态，包括天数和所有玩家驻地信息" })
  @Get()
  async getWorld() {
    const courseWorld = await this.prisma.courseWorld.findFirst({
      orderBy: { id: "asc" }
    });

    if (!courseWorld) {
      throw new NotFoundException("Course world not found");
    }

    const onlineUserIds = this.presence.onlineUserIds();
    const homesteads = onlineUserIds.length === 0 ? [] : await this.prisma.homestead.findMany({
      where: { ownerId: { in: onlineUserIds } },
      include: {
        owner: true
      },
      orderBy: { id: "asc" }
    });

    return {
      currentDay: courseWorld.currentDay,
      location: "main_city",
      homesteads: homesteads.map((homestead) => ({
        ownerId: homestead.ownerId,
        displayName: homestead.owner.displayName,
        location: "homestead",
        isOnline: true
      }))
    };
  }
}
