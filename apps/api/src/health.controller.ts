import { Controller, Get, Inject, ServiceUnavailableException } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import {
  isReviewQueueRequired,
  ReviewQueueService
} from "./modules/queue/review.queue";
import { PrismaService } from "./prisma/prisma.service";

@ApiTags("health")
@Controller("health")
export class HealthController {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ReviewQueueService) private readonly reviewQueue: ReviewQueueService
  ) {}

  @ApiOperation({ summary: "健康检查", description: "检查 API 服务是否正常运行" })
  @Get()
  health() {
    return { status: "ok" };
  }

  @ApiOperation({ summary: "就绪检查", description: "确认 API 与数据库均可用" })
  @Get("ready")
  async ready() {
    try {
      // Touch key classroom tables so a partially migrated database is never
      // reported as ready merely because the connection itself succeeds.
      await Promise.all([
        this.prisma.user.count(),
        this.prisma.reviewResult.count(),
        this.prisma.agentTask.count()
      ]);
    } catch {
      throw new ServiceUnavailableException({
        status: "not_ready",
        database: "down",
        schema: "down",
        redis: "unknown"
      });
    }

    let redis: "up" | "disabled" | "down";
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    try {
      redis = await Promise.race([
        this.reviewQueue.checkHealth(),
        new Promise<never>((_, reject) => {
          timeoutId = setTimeout(
            () => reject(new Error("Redis readiness timeout")),
            2_000
          );
        })
      ]);
    } catch {
      redis = "down";
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }

    if (isReviewQueueRequired() && redis !== "up") {
      throw new ServiceUnavailableException({
        status: "not_ready",
        database: "up",
        schema: "up",
        redis
      });
    }

    return {
      status: redis === "down" ? "degraded" : "ready",
      database: "up",
      schema: "up",
      redis
    };
  }
}
