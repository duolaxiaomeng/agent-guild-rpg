import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  Post
} from "@nestjs/common";
import {
  GuildMembershipRole,
  MembershipStatus,
  UserRole
} from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";

type CreateGuildBody = {
  name: string;
  description: string;
};

@Controller("guilds")
export class GuildsController {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService
  ) {}

  @Get()
  async list() {
    const guilds = await this.prisma.guild.findMany({
      include: {
        memberships: {
          where: {
            status: MembershipStatus.active
          }
        }
      },
      orderBy: { name: "asc" }
    });

    return guilds.map((guild) => ({
      id: guild.id,
      name: guild.name,
      memberCount: guild.memberships.length,
      collaborationPoints: guild.collaborationPoints
    }));
  }

  @Post()
  async create(@Body() body: CreateGuildBody) {
    const owner = await this.prisma.user.findFirst({
      where: { role: UserRole.student },
      orderBy: { id: "asc" }
    });

    if (!owner) {
      throw new BadRequestException("No student available to own guild");
    }

    const guild = await this.prisma.$transaction(async (tx) => {
      const createdGuild = await tx.guild.create({
        data: {
          name: body.name,
          description: body.description,
          ownerId: owner.id
        }
      });

      await tx.guildMembership.create({
        data: {
          guildId: createdGuild.id,
          userId: owner.id,
          role: GuildMembershipRole.leader,
          status: MembershipStatus.active
        }
      });

      return createdGuild;
    });

    return {
      id: guild.id,
      name: guild.name,
      description: guild.description,
      memberCount: 1,
      collaborationPoints: guild.collaborationPoints
    };
  }
}
