import { Body, Controller, Get, Inject, Param, Post, Query, UseGuards } from "@nestjs/common";
import { IsNumber, IsOptional, IsString, Min } from "class-validator";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { UserRole } from "@prisma/client";
import { AuthGuard } from "../auth/auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import { RoomsService } from "./rooms.service";

class CreateAccessGrantDto {
  @IsString()
  roomId!: string;

  @IsString()
  granteeId!: string;

  @IsOptional()
  @IsString()
  scope?: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  expiresInHours?: number;
}

@ApiTags("rooms")
@ApiBearerAuth()
@Controller("rooms")
@UseGuards(AuthGuard)
export class RoomsController {
  constructor(@Inject(RoomsService) private readonly roomsService: RoomsService) {}

  @ApiOperation({ summary: "创建房间访问授权", description: "为指定用户创建聊天房间的访问授权，支持设置权限范围和过期时间" })
  @Post("access-grants")
  createGrant(
    @Body() body: CreateAccessGrantDto,
    @CurrentUser() user: { id: string; role: UserRole; displayName: string }
  ) {
    return this.roomsService.createGrant(
      body.roomId,
      user,
      body.granteeId,
      body.scope ?? "chat_summary",
      body.expiresInHours ?? 24
    );
  }

  @ApiOperation({ summary: "获取房间授权列表", description: "查询指定房间的所有访问授权记录" })
  @Get("access-grants")
  listGrants(
    @Query("roomId") roomId: string,
    @CurrentUser() user: { id: string; role: UserRole; displayName: string }
  ) {
    return this.roomsService.listGrants(roomId, user);
  }

  @ApiOperation({ summary: "获取可访问的房间列表", description: "返回当前用户有权限访问的所有房间列表" })
  @Get("accessible-rooms")
  listAccessibleRooms(
    @CurrentUser() user: { id: string; role: UserRole; displayName: string }
  ) {
    return this.roomsService.listAccessibleRooms(user);
  }

  @ApiOperation({ summary: "撤销房间访问授权", description: "撤销指定的房间访问授权记录" })
  @Post("access-grants/:grantId/revoke")
  revokeGrant(
    @Param("grantId") grantId: string,
    @CurrentUser() user: { id: string; role: UserRole; displayName: string }
  ) {
    return this.roomsService.revokeGrant(grantId, user);
  }
}
