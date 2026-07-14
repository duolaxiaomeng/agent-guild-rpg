import {
  Body,
  Controller,
  Get,
  Inject,
  Post,
  UseGuards
} from "@nestjs/common";
import { IsString } from "class-validator";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import {
  GuildMembershipRole,
  MembershipStatus,
  UserRole
} from "@prisma/client";
import { AuthGuard } from "../auth/auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import { PrismaService } from "../../prisma/prisma.service";

class CreateGuildDto {
  @IsString()
  name!: string;

  @IsString()
  description!: string;
}

@ApiTags("guilds")
@ApiBearerAuth()
@Controller("guilds")
@UseGuards(AuthGuard)
export class GuildsController {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService
  ) {}

  @ApiOperation({ summary: "获取公会列表", description: "返回所有公会列表，包含成员数、协作积分和描述信息" })
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
      description: guild.description,
      memberCount: guild.memberships.length,
      collaborationPoints: guild.collaborationPoints
    }));
  }

  @ApiOperation({ summary: "创建公会", description: "创建新公会并自动将创建者设为公会会长" })
  @Post()
  async create(
    @Body() body: CreateGuildDto,
    @CurrentUser() user: { id: string; role: UserRole; displayName: string }
  ) {
    const ownerId = user.id;

    const guild = await this.prisma.$transaction(async (tx) => {
      const createdGuild = await tx.guild.create({
        data: {
          name: body.name,
          description: body.description,
          ownerId
        }
      });

      await tx.guildMembership.create({
        data: {
          guildId: createdGuild.id,
          userId: ownerId,
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
