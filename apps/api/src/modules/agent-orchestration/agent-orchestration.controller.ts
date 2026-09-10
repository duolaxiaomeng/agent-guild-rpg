import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { AgentTaskResourceClass } from "@prisma/client";
import {
  IsArray,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from "class-validator";
import { AuthGuard } from "../auth/auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import { AgentOrchestrationService } from "./agent-orchestration.service";

type OrchestrationActor = {
  readonly id: string;
  readonly role: "teacher" | "student";
  readonly displayName: string;
};

class CreateAgentRunDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  runId!: string;

  @IsString()
  @IsNotEmpty()
  studentId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  provider!: string;

  @IsOptional()
  input?: unknown;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  dependencies?: string[];

  @IsOptional()
  @IsString()
  courseWorldId?: string;

  @IsOptional()
  @IsString()
  dayId?: string;

  @IsOptional()
  @IsString()
  guildId?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  requiredCapabilities?: string[];

  @IsOptional()
  @IsInt()
  @Min(-1000)
  @Max(1000)
  priority?: number;

  @IsOptional()
  @IsEnum(AgentTaskResourceClass)
  resourceClass?: AgentTaskResourceClass;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  maxAttempts?: number;
}

@ApiTags("agent-orchestration")
@ApiBearerAuth()
@Controller("agent-orchestration")
@UseGuards(AuthGuard)
export class AgentOrchestrationController {
  constructor(
    @Inject(AgentOrchestrationService)
    private readonly orchestrationService: AgentOrchestrationService,
  ) {}

  @ApiOperation({ summary: "创建 Agent 运行任务" })
  @Post("runs")
  create(
    @Body() body: CreateAgentRunDto,
    @CurrentUser() actor: OrchestrationActor,
  ) {
    this.assertTeacher(actor);
    return this.orchestrationService.create(body);
  }

  @ApiOperation({ summary: "列出 Agent 运行任务" })
  @Get("runs")
  list(@CurrentUser() actor: OrchestrationActor) {
    this.assertTeacher(actor);
    return this.orchestrationService.list();
  }

  @ApiOperation({ summary: "列出当前学生被分配的 Agent 运行任务" })
  @Get("my-runs")
  listMine(@CurrentUser() actor: OrchestrationActor) {
    this.assertStudent(actor);
    return this.orchestrationService.listForStudent(actor.id);
  }

  @ApiOperation({ summary: "获取 Agent 运行任务详情" })
  @Get("runs/:runId")
  get(
    @Param("runId") runId: string,
    @CurrentUser() actor: OrchestrationActor,
  ) {
    this.assertTeacher(actor);
    return this.orchestrationService.get(runId);
  }

  @ApiOperation({ summary: "调度所有满足依赖条件的 Agent 任务" })
  @Post("schedule")
  @HttpCode(HttpStatus.ACCEPTED)
  schedule(@CurrentUser() actor: OrchestrationActor) {
    this.assertTeacher(actor);
    return this.orchestrationService.schedule();
  }

  @ApiOperation({ summary: "暂停 Agent 运行任务" })
  @Post("runs/:runId/pause")
  @HttpCode(HttpStatus.OK)
  pause(
    @Param("runId") runId: string,
    @CurrentUser() actor: OrchestrationActor,
  ) {
    this.assertTeacher(actor);
    return this.orchestrationService.pause(runId);
  }

  @ApiOperation({ summary: "恢复 Agent 运行任务" })
  @Post("runs/:runId/resume")
  @HttpCode(HttpStatus.OK)
  resume(
    @Param("runId") runId: string,
    @CurrentUser() actor: OrchestrationActor,
  ) {
    this.assertTeacher(actor);
    return this.orchestrationService.resume(runId);
  }

  @ApiOperation({ summary: "取消 Agent 运行任务" })
  @Post("runs/:runId/cancel")
  @HttpCode(HttpStatus.OK)
  cancel(
    @Param("runId") runId: string,
    @CurrentUser() actor: OrchestrationActor,
  ) {
    this.assertTeacher(actor);
    return this.orchestrationService.cancel(runId);
  }

  private assertTeacher(actor: OrchestrationActor | undefined): void {
    if (actor?.role !== "teacher") {
      throw new ForbiddenException("Only teachers can manage Agent runs");
    }
  }

  private assertStudent(actor: OrchestrationActor | undefined): void {
    if (actor?.role !== "student") {
      throw new ForbiddenException("Only students can read their assigned Agent runs");
    }
  }
}
