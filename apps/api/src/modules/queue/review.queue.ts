import { Injectable } from "@nestjs/common";

export type ReviewQueueJob = {
  jobId: string;
  status: "queued";
};

@Injectable()
export class ReviewQueueService {
  async enqueue(submissionId: string): Promise<ReviewQueueJob> {
    return {
      jobId: `review-${submissionId}`,
      status: "queued"
    };
  }
}
