import { Module } from "@nestjs/common";
import { MemoryService } from "./modules/memory/memory.service";
import { SopEngineService } from "./modules/memory/teaching-agents/sop-engine.service";
import { ReviewProcessingService } from "./modules/queue/review.processor";
import { ReviewQueueService } from "./modules/queue/review.queue";
import { PrismaModule } from "./prisma/prisma.module";

@Module({
  imports: [PrismaModule],
  providers: [
    MemoryService,
    SopEngineService,
    ReviewProcessingService,
    ReviewQueueService
  ],
  exports: [ReviewProcessingService, ReviewQueueService]
})
export class ReviewWorkerModule {}
