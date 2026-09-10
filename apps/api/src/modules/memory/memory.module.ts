import { Module } from "@nestjs/common";
import { RealtimeModule } from "../realtime/realtime.module";
import { AgentAvatarService } from "./agent-avatar/agent-avatar.service";
import { LearningInsightService } from "./learning-insight/learning-insight.service";
import { MemoryService } from "./memory.service";
import { NpcConversationService } from "./npc-conversation.service";
import { SopEngineService } from "./teaching-agents/sop-engine.service";
import { TeachingAgentService } from "./teaching-agents/teaching-agent.service";

@Module({
  imports: [RealtimeModule],
  providers: [
    MemoryService,
    NpcConversationService,
    AgentAvatarService,
    LearningInsightService,
    SopEngineService,
    TeachingAgentService,
  ],
  exports: [
    MemoryService,
    NpcConversationService,
    AgentAvatarService,
    LearningInsightService,
    SopEngineService,
    TeachingAgentService,
  ],
})
export class MemoryModule {}
