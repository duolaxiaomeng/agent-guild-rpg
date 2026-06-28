import { Module } from "@nestjs/common";
import { HealthController } from "./health.controller";
import { AuthController } from "./modules/auth/auth.controller";
import { GuildsController } from "./modules/guilds/guilds.controller";
import { QuestsController } from "./modules/quests/quests.controller";
import { ReviewsController } from "./modules/reviews/reviews.controller";
import { RoomsController } from "./modules/rooms/rooms.controller";
import { SubmissionsController } from "./modules/submissions/submissions.controller";
import { WorldController } from "./modules/world/world.controller";

@Module({
  controllers: [
    HealthController,
    AuthController,
    WorldController,
    QuestsController,
    GuildsController,
    RoomsController,
    SubmissionsController,
    ReviewsController
  ]
})
export class AppModule {}
