import { Module } from "@nestjs/common";
import { PrismaModule } from "../../prisma/prisma.module";
import { PresenceService } from "./presence.service";
import { RealtimeGateway } from "./realtime.gateway";
import { AgentWorldService } from "./agent-world.service";

@Module({
  imports: [PrismaModule],
  providers: [PresenceService, AgentWorldService, RealtimeGateway],
  exports: [PresenceService, AgentWorldService, RealtimeGateway]
})
export class RealtimeModule {}
