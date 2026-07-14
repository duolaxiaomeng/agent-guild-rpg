import { Injectable, Optional, type OnApplicationShutdown } from "@nestjs/common";
import { Queue, type JobsOptions } from "bullmq";

export type ReviewQueueJob = {
  jobId: string;
  status: "queued";
};

export type ReviewQueuePayload = {
  submissionId: string;
};

export type ReviewQueuePort = {
  add(
    name: string,
    data: ReviewQueuePayload,
    opts: JobsOptions
  ): Promise<unknown>;
  close?(): Promise<void>;
};

export const REVIEW_QUEUE_NAME = "review-jobs";
export const REVIEW_JOB_NAME = "generate-review";

export function getReviewQueueConnection() {
  return {
    url: process.env.REDIS_URL ?? "redis://127.0.0.1:6379"
  };
}

export function isReviewQueueConfigured() {
  return Boolean(process.env.REDIS_URL?.trim());
}

export function createReviewQueue(): ReviewQueuePort {
  return new Queue(REVIEW_QUEUE_NAME, {
    connection: getReviewQueueConnection()
  });
}

@Injectable()
export class ReviewQueueService implements OnApplicationShutdown {
  private queue?: ReviewQueuePort;

  constructor(@Optional() private readonly queueFactory = createReviewQueue) {}

  async enqueue(submissionId: string): Promise<ReviewQueueJob> {
    if (this.queueFactory === createReviewQueue && !isReviewQueueConfigured()) {
      throw new Error("Review queue is disabled because REDIS_URL is not configured");
    }
    const queue = this.getQueue();
    const jobId = `review-${submissionId}`;

    await queue.add(
      REVIEW_JOB_NAME,
      { submissionId },
      {
        jobId,
        removeOnComplete: true,
        removeOnFail: 100
      }
    );

    return {
      jobId,
      status: "queued"
    };
  }

  async onApplicationShutdown() {
    await this.queue?.close?.();
  }

  private getQueue() {
    this.queue ??= this.queueFactory();
    return this.queue;
  }
}
