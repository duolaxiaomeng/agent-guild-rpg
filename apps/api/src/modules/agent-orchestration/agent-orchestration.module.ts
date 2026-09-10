import { Module } from "@nestjs/common";
import { PrismaModule } from "../../prisma/prisma.module";
import { MemoryModule } from "../memory/memory.module";
import { RealtimeModule } from "../realtime/realtime.module";
import { AuthGuard } from "../auth/auth.guard";
import { AuthService } from "../auth/auth.service";
import { AgentConnectorsService } from "../agent-connectors/agent-connectors.service";
import { AgentOrchestrationController } from "./agent-orchestration.controller";
import { AgentOrchestrationService } from "./agent-orchestration.service";
import { AgentTaskWorkerController } from "./agent-task-worker.controller";
import { AgentTaskService } from "./agent-task.service";

@Module({
  imports: [PrismaModule, MemoryModule, RealtimeModule],
  controllers: [AgentOrchestrationController, AgentTaskWorkerController],
  providers: [
    AuthService,
    AuthGuard,
    AgentConnectorsService,
    AgentTaskService,
    AgentOrchestrationService,
  ],
  exports: [AgentOrchestrationService, AgentTaskService],
})
export class AgentOrchestrationModule {}
