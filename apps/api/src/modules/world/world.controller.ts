import { Controller, Get } from "@nestjs/common";

@Controller("world")
export class WorldController {
  @Get()
  getWorld() {
    return {
      currentDay: 1,
      location: "main_city",
      homesteads: [
        {
          ownerId: "11111111-1111-4111-8111-111111111111",
          displayName: "lin",
          location: "homestead",
          isOnline: true
        }
      ]
    };
  }
}
