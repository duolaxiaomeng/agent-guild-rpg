import { Module } from "@nestjs/common";
import { ThrottlerModule } from "@nestjs/throttler";
import { HealthController } from "./health.controller";
import { AuthController } from "./modules/auth/auth.controller";
import { AuthGuard } from "./modules/auth/auth.guard";
import { AuthService } from "./modules/auth/auth.service";
import { AgentConnectorsController } from "./modules/agent-connectors/agent-connectors.controller";
import { AgentConnectorsService } from "./modules/agent-connectors/agent-connectors.service";
import { AgentOrchestrationModule } from "./modules/agent-orchestration/agent-orchestration.module";
import { AgentTeamController } from "./modules/agent-team/agent-team.controller";
import { AgentTeamService } from "./modules/agent-team/agent-team.service";
import { ChatController } from "./modules/chat/chat.controller";
import { ChatService } from "./modules/chat/chat.service";
import { ClassroomsModule } from "./modules/classrooms/classrooms.module";
import { GuildsController } from "./modules/guilds/guilds.controller";
import { AgentAvatarController } from "./modules/memory/agent-avatar/agent-avatar.controller";
import { LearningInsightController } from "./modules/memory/learning-insight/learning-insight.controller";
import { MemoryController } from "./modules/memory/memory.controller";
import { MemoryModule } from "./modules/memory/memory.module";
import { NpcConversationController } from "./modules/memory/npc-conversation.controller";
import { TeachingAgentController } from "./modules/memory/teaching-agents/teaching-agent.controller";
import { ReviewQueueService } from "./modules/queue/review.queue";
import { ReviewProcessingService } from "./modules/queue/review.processor";
import { QuestsController } from "./modules/quests/quests.controller";
import { QuestsService } from "./modules/quests/quests.service";
import { RealtimeModule } from "./modules/realtime/realtime.module";
import { ReviewsController } from "./modules/reviews/reviews.controller";
import { RoomsController } from "./modules/rooms/rooms.controller";
import { RoomsService } from "./modules/rooms/rooms.service";
import { SubmissionsController } from "./modules/submissions/submissions.controller";
import { WorldController } from "./modules/world/world.controller";
import { WebsiteLotteryController } from "./modules/website-lottery/website-lottery.controller";
import { WebsiteLotteryService } from "./modules/website-lottery/website-lottery.service";
import { PrismaModule } from "./prisma/prisma.module";

@Module({
  imports: [
    PrismaModule,
    AgentOrchestrationModule,
    ClassroomsModule,
    RealtimeModule,
    MemoryModule,
    // R-007: Throttler module for rate limiting
    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: 60,
      },
    ]),
  ],
  controllers: [
    HealthController,
    AuthController,
    AgentConnectorsController,
    AgentTeamController,
    ChatController,
    WorldController,
    QuestsController,
    GuildsController,
    RoomsController,
    SubmissionsController,
    ReviewsController,
    MemoryController,
    NpcConversationController,
    AgentAvatarController,
    LearningInsightController,
    TeachingAgentController,
    WebsiteLotteryController
  ],
  providers: [
    AuthService,
    AgentConnectorsService,
    AgentTeamService,
    AuthGuard,
    ChatService,
    QuestsService,
    RoomsService,
    ReviewQueueService,
    ReviewProcessingService,
    WebsiteLotteryService
  ]
})
export class AppModule {}
