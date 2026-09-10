import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  UseGuards
} from "@nestjs/common";
import { IsString } from "class-validator";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { UserRole } from "@prisma/client";
import { AuthGuard } from "../auth/auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import { GuildsService, type GuildActor } from "./guilds.service";

class CreateGuildDto {
  @IsString()
  name!: string;

  @IsString()
  description!: string;
}

class CreateGuildInvitationDto {
  @IsString()
  email!: string;
}

@ApiTags("guilds")
@ApiBearerAuth()
@Controller("guilds")
@UseGuards(AuthGuard)
export class GuildsController {
  constructor(
    @Inject(GuildsService) private readonly guildsService: GuildsService
  ) {}

  @ApiOperation({ summary: "获取公会列表", description: "返回所有公会列表，包含成员数、协作积分和描述信息" })
  @Get()
  list(@CurrentUser() user: GuildActor) {
    return this.guildsService.list(user);
  }

  @ApiOperation({ summary: "创建公会", description: "创建新公会并自动将创建者设为公会会长" })
  @Post()
  create(
    @Body() body: CreateGuildDto,
    @CurrentUser() user: { id: string; role: UserRole; displayName: string }
  ) {
    return this.guildsService.create(body, user);
  }

  @ApiOperation({ summary: "邀请学生加入工会" })
  @Post(":guildId/invitations")
  invite(
    @Param("guildId") guildId: string,
    @Body() body: CreateGuildInvitationDto,
    @CurrentUser() user: GuildActor
  ) {
    return this.guildsService.invite(guildId, body, user);
  }

  @ApiOperation({ summary: "获取我的工会邀请" })
  @Get("invitations/me")
  listMyInvitations(@CurrentUser() user: GuildActor) {
    return this.guildsService.listMyInvitations(user);
  }

  @ApiOperation({ summary: "接受工会邀请" })
  @Post("invitations/:invitationId/accept")
  acceptInvitation(
    @Param("invitationId") invitationId: string,
    @CurrentUser() user: GuildActor
  ) {
    return this.guildsService.acceptInvitation(invitationId, user);
  }

  @ApiOperation({ summary: "拒绝工会邀请" })
  @Post("invitations/:invitationId/decline")
  declineInvitation(
    @Param("invitationId") invitationId: string,
    @CurrentUser() user: GuildActor
  ) {
    return this.guildsService.declineInvitation(invitationId, user);
  }

  @ApiOperation({ summary: "获取工会成员列表" })
  @Get(":guildId/members")
  listMembers(@Param("guildId") guildId: string) {
    return this.guildsService.listMembers(guildId);
  }

  @ApiOperation({ summary: "移除工会成员" })
  @Post(":guildId/members/:userId/remove")
  removeMember(
    @Param("guildId") guildId: string,
    @Param("userId") userId: string,
    @CurrentUser() user: GuildActor
  ) {
    return this.guildsService.removeMember(guildId, userId, user);
  }
}
