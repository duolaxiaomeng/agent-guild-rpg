import { Controller, Get, Inject, ServiceUnavailableException } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { PrismaService } from "./prisma/prisma.service";

@ApiTags("health")
@Controller("health")
export class HealthController {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  @ApiOperation({ summary: "健康检查", description: "检查 API 服务是否正常运行" })
  @Get()
  health() {
    return { status: "ok" };
  }

  @ApiOperation({ summary: "就绪检查", description: "确认 API 与数据库均可用" })
  @Get("ready")
  async ready() {
    try {
      // Query a required application table so an empty SQLite file or a
      // partially initialized schema cannot be reported as ready.
      await this.prisma.user.count();
      return { status: "ready", database: "up" };
    } catch {
      throw new ServiceUnavailableException({
        status: "not_ready",
        database: "down"
      });
    }
  }
}
