import { Body, Controller, Post } from "@nestjs/common";

type CreateAccessGrantBody = {
  roomId: string;
  granteeId: string;
};

@Controller("rooms")
export class RoomsController {
  @Post("access-grants")
  createGrant(@Body() body: CreateAccessGrantBody) {
    return {
      id: "grant-1",
      roomId: body.roomId,
      granteeId: body.granteeId,
      status: "approved",
      scope: "chat_summary"
    };
  }
}
