import { Module } from "@nestjs/common";
import { PrismaModule } from "../../prisma/prisma.module";
import { AuthGuard } from "../auth/auth.guard";
import { AuthService } from "../auth/auth.service";
import { AgentOrchestrationController } from "./agent-orchestration.controller";
import { AgentOrchestrationService } from "./agent-orchestration.service";
import {
  AGENT_LOOP_RUNNER,
  AGENT_ORCHESTRATION_OPTIONS,
  AGENT_RUN_STATE_PERSISTENCE,
  UnconfiguredAgentLoopRunner,
} from "./agent-orchestration.tokens";
import { PrismaAgentRunStatePersistence } from "./prisma-agent-run-state.persistence";

@Module({
  imports: [PrismaModule],
  controllers: [AgentOrchestrationController],
  providers: [
    AuthService,
    AuthGuard,
    AgentOrchestrationService,
    PrismaAgentRunStatePersistence,
    {
      provide: AGENT_LOOP_RUNNER,
      useClass: UnconfiguredAgentLoopRunner,
    },
    {
      provide: AGENT_RUN_STATE_PERSISTENCE,
      useExisting: PrismaAgentRunStatePersistence,
    },
    {
      provide: AGENT_ORCHESTRATION_OPTIONS,
      useValue: {},
    },
  ],
  exports: [
    AgentOrchestrationService,
    AGENT_LOOP_RUNNER,
    AGENT_RUN_STATE_PERSISTENCE,
  ],
})
export class AgentOrchestrationModule {}
