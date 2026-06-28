import { Body, Controller, Get, Post } from "@nestjs/common";

type CreateGuildBody = {
  name: string;
  description: string;
};

@Controller("guilds")
export class GuildsController {
  @Get()
  list() {
    return [
      {
        id: "guild-1",
        name: "Morning Forge",
        memberCount: 3,
        collaborationPoints: 12
      }
    ];
  }

  @Post()
  create(@Body() body: CreateGuildBody) {
    return {
      id: "guild-1",
      name: body.name,
      description: body.description,
      memberCount: 1,
      collaborationPoints: 0
    };
  }
}
