import { Worker, type Processor } from "bullmq";
import {
  getReviewQueueConnection,
  REVIEW_JOB_NAME,
  REVIEW_QUEUE_NAME,
  type ReviewQueuePayload
} from "./review.queue";

export type ReviewProcessorResult = {
  submissionId: string;
  suggestedScore: number;
};

const defaultReviewProcessor: Processor<
  ReviewQueuePayload,
  ReviewProcessorResult
> = async (job) => {
  return {
    submissionId: job.data.submissionId,
    suggestedScore: 85
  };
};

export function createReviewWorker(
  processor: Processor<ReviewQueuePayload, ReviewProcessorResult> =
    defaultReviewProcessor
) {
  return new Worker(REVIEW_QUEUE_NAME, processor, {
    connection: getReviewQueueConnection(),
    concurrency: 1
  });
}

export { REVIEW_JOB_NAME };
