import { Controller, Get, Inject, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";

@Controller("world")
export class WorldController {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService
  ) {}

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
