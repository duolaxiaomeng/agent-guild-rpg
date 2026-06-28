import { Controller, Get } from "@nestjs/common";

@Controller("quests")
export class QuestsController {
  @Get()
  list() {
    return [
      { id: "day-1", title: "First Agent Session", status: "open" },
      { id: "day-2", title: "Prompt Iteration", status: "locked" }
    ];
  }
}
