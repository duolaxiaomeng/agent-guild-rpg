import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  Res,
} from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import type { Response } from "express";
import {
  IsIn,
  IsDefined,
  IsInt,
  IsNotEmpty,
  IsString,
  Max,
  MaxLength,
  Min,
} from "class-validator";
import { AgentTaskService } from "./agent-task.service";

class ClaimAgentTaskDto {
  @IsInt()
  @Min(0)
  @Max(8)
  lightCapacity = 1;

  @IsInt()
  @Min(0)
  @Max(1)
  heavyCapacity = 1;

  @IsInt()
  @Min(0)
  @Max(25)
  waitSeconds = 25;
}

class AgentTaskHeartbeatDto {
  @IsString()
  @IsNotEmpty()
  leaseToken!: string;
}

class CompleteAgentTaskDto extends AgentTaskHeartbeatDto {
  @IsDefined()
  result!: unknown;
}

class FailAgentTaskDto extends AgentTaskHeartbeatDto {
  @IsString()
  @IsIn(["infrastructure", "business"])
  kind!: "infrastructure" | "business";

  @IsString()
  @IsNotEmpty()
  @MaxLength(8000)
  error!: string;
}

@ApiTags("agent-task-worker")
@Controller("agent-connectors/tasks")
export class AgentTaskWorkerController {
  constructor(
    @Inject(AgentTaskService) private readonly tasks: AgentTaskService,
  ) {}

  @ApiOperation({ summary: "Connector 长轮询领取一个可执行任务" })
  @Post("claim")
  async claim(
    @Headers("x-agent-connector-token") connectorToken: string,
    @Body() body: ClaimAgentTaskDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const lease = await this.tasks.claim(connectorToken, body);
    if (!lease) {
      response.status(HttpStatus.NO_CONTENT);
      return undefined;
    }
    return lease;
  }

  @ApiOperation({ summary: "续期任务租约并标记为运行中" })
  @Post(":taskId/heartbeat")
  heartbeat(
    @Headers("x-agent-connector-token") connectorToken: string,
    @Param("taskId") taskId: string,
    @Body() body: AgentTaskHeartbeatDto,
  ) {
    return this.tasks.heartbeat(connectorToken, taskId, body.leaseToken);
  }

  @ApiOperation({ summary: "完成任务并释放其依赖任务" })
  @Post(":taskId/complete")
  complete(
    @Headers("x-agent-connector-token") connectorToken: string,
    @Param("taskId") taskId: string,
    @Body() body: CompleteAgentTaskDto,
  ) {
    return this.tasks.complete(
      connectorToken,
      taskId,
      body.leaseToken,
      body.result,
    );
  }

  @ApiOperation({ summary: "报告任务失败，基础设施错误按策略重试" })
  @Post(":taskId/fail")
  @HttpCode(HttpStatus.OK)
  fail(
    @Headers("x-agent-connector-token") connectorToken: string,
    @Param("taskId") taskId: string,
    @Body() body: FailAgentTaskDto,
  ) {
    return this.tasks.fail(connectorToken, taskId, body);
  }
}
