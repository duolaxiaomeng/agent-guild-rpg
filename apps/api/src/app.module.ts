import { Module } from "@nestjs/common";
import { HealthController } from "./health.controller";
import { AuthController } from "./modules/auth/auth.controller";
import { QuestsController } from "./modules/quests/quests.controller";
import { WorldController } from "./modules/world/world.controller";

@Module({
  controllers: [HealthController, AuthController, WorldController, QuestsController]
})
export class AppModule {}
