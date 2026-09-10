import "reflect-metadata";
import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import {
  createReviewWorker,
  getReviewWorkerConcurrency,
  ReviewProcessingService
} from "./modules/queue/review.processor";
import { ReviewQueueService } from "./modules/queue/review.queue";
import { ReviewWorkerModule } from "./review-worker.module";

const logger = new Logger("ReviewWorkerBootstrap");

async function bootstrap() {
  const context = await NestFactory.createApplicationContext(ReviewWorkerModule, {
    logger: ["log", "warn", "error"]
  });
  const worker = createReviewWorker(context.get(ReviewProcessingService));
  const reviewProcessing = context.get(ReviewProcessingService);
  const reviewQueue = context.get(ReviewQueueService);
  let recoveryRunning = false;
  const recoverQueuedReviews = async () => {
    if (recoveryRunning) return;
    recoveryRunning = true;
    try {
      const submissionIds = await reviewProcessing.listQueuedSubmissionIds();
      for (const submissionId of submissionIds) {
        await reviewQueue.enqueue(submissionId);
      }
      if (submissionIds.length > 0) {
        logger.log(`Recovered ${submissionIds.length} queued reviews`);
      }
    } catch (error: unknown) {
      logger.warn(
        `Queued review recovery failed: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    } finally {
      recoveryRunning = false;
    }
  };
  await recoverQueuedReviews();
  const recoveryTimer = setInterval(() => {
    void recoverQueuedReviews();
  }, 30_000);

  const shutdown = async (signal: string) => {
    logger.log(`Received ${signal}; closing review worker`);
    clearInterval(recoveryTimer);
    await worker.close();
    await context.close();
  };

  process.once("SIGINT", () => void shutdown("SIGINT"));
  process.once("SIGTERM", () => void shutdown("SIGTERM"));
  logger.log(`Review worker started with concurrency=${getReviewWorkerConcurrency()}`);
}

void bootstrap().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  logger.error(`Review worker failed to start: ${message}`);
  process.exitCode = 1;
});
