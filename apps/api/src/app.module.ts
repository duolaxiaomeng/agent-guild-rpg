import { Module } from "@nestjs/common";
import { HealthController } from "./health.controller";
import { AuthController } from "./modules/auth/auth.controller";
import { AuthService } from "./modules/auth/auth.service";
import { ChatController } from "./modules/chat/chat.controller";
import { GuildsController } from "./modules/guilds/guilds.controller";
import { ReviewQueueService } from "./modules/queue/review.queue";
import { QuestsController } from "./modules/quests/quests.controller";
import { RealtimeGateway } from "./modules/realtime/realtime.gateway";
import { ReviewsController } from "./modules/reviews/reviews.controller";
import { RoomsController } from "./modules/rooms/rooms.controller";
import { RoomsService } from "./modules/rooms/rooms.service";
import { SubmissionsController } from "./modules/submissions/submissions.controller";
import { WorldController } from "./modules/world/world.controller";
import { PrismaModule } from "./prisma/prisma.module";

@Module({
  imports: [PrismaModule],
  controllers: [
    HealthController,
    AuthController,
    ChatController,
    WorldController,
    QuestsController,
    GuildsController,
    RoomsController,
    SubmissionsController,
    ReviewsController
  ],
  providers: [AuthService, RoomsService, RealtimeGateway, ReviewQueueService]
})
export class AppModule {}
