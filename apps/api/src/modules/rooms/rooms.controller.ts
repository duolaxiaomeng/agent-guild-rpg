import { Body, Controller, Get, Inject, Param, Post, Query } from "@nestjs/common";
import { RoomsService } from "./rooms.service";

type CreateAccessGrantBody = {
  roomId: string;
  granteeId: string;
  scope?: string;
  expiresInHours?: number;
};

@Controller("rooms")
export class RoomsController {
  constructor(@Inject(RoomsService) private readonly roomsService: RoomsService) {}

  @Post("access-grants")
  createGrant(@Body() body: CreateAccessGrantBody) {
    return this.roomsService.createGrant(
      body.roomId,
      body.granteeId,
      body.scope ?? "chat_summary",
      body.expiresInHours ?? 24
    );
  }

  @Get("access-grants")
  listGrants(@Query("roomId") roomId: string) {
    return this.roomsService.listGrants(roomId);
  }

  @Post("access-grants/:grantId/revoke")
  revokeGrant(@Param("grantId") grantId: string) {
    return this.roomsService.revokeGrant(grantId);
  }
}
