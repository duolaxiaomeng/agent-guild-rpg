import { Controller, Get, Inject } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";

@Controller("quests")
export class QuestsController {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService
  ) {}

  @Get()
  async list() {
    const quests = await this.prisma.questDay.findMany({
      orderBy: { id: "asc" }
    });

    return quests.map((quest) => ({
      id: quest.id,
      title: quest.title,
      status: quest.status
    }));
  }
}
