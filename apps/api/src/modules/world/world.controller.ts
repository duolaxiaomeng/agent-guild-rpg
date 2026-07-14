import { Controller, Get, Inject, NotFoundException, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { AuthGuard } from "../auth/auth.guard";
import { PrismaService } from "../../prisma/prisma.service";

@ApiTags("world")
@ApiBearerAuth()
@Controller("world")
@UseGuards(AuthGuard)
export class WorldController {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService
  ) {}

  @ApiOperation({ summary: "获取游戏世界信息", description: "返回当前课程世界状态，包括天数和所有玩家驻地信息" })
  @Get()
  async getWorld() {
    const courseWorld = await this.prisma.courseWorld.findFirst({
      orderBy: { id: "asc" }
    });

    if (!courseWorld) {
      throw new NotFoundException("Course world not found");
    }

    const homesteads = await this.prisma.homestead.findMany({
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
        isOnline: homestead.owner.isOnline
      }))
    };
  }
}
