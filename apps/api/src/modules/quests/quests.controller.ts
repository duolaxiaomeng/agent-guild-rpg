import {
  Body,
  Controller,
  Get,
  Inject,
  Post,
  UseGuards
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDefined,
  IsIn,
  IsISO8601,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf
} from "class-validator";
import type { CreateTeacherTaskInput, TeacherTaskStatus } from "contracts";
import { AuthGuard } from "../auth/auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import { QuestActor, QuestsService } from "./quests.service";

class CreateTeacherTaskDto implements CreateTeacherTaskInput {
  @IsString()
  @MinLength(1)
  courseWorldId!: string;

  @IsString()
  @MinLength(1)
  dayId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @IsIn(["open", "locked", "completed"])
  status!: TeacherTaskStatus;

  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  description!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  homework!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MinLength(1, { each: true })
  @MaxLength(500, { each: true })
  acceptanceCriteria!: string[];

  @IsDefined()
  @ValidateIf((_object, value) => value !== null)
  @IsISO8601()
  dueAt!: string | null;

  @IsDefined()
  @ValidateIf((_object, value) => value !== null)
  @IsISO8601()
  publishedAt!: string | null;
}

@ApiTags("quests")
@ApiBearerAuth()
@Controller("quests")
@UseGuards(AuthGuard)
export class QuestsController {
  constructor(
    @Inject(QuestsService) private readonly questsService: QuestsService
  ) {}

  @ApiOperation({
    summary: "获取任务列表",
    description: "返回所有关卡任务与每日作业字段，并保留原 id/title/status 字段"
  })
  @Get()
  list() {
    return this.questsService.list();
  }

  @ApiOperation({ summary: "获取每日作业进度", description: "教师专用，按学生聚合提交与评审进度" })
  @Get("progress")
  progress(@CurrentUser() actor: QuestActor) {
    return this.questsService.progress(actor);
  }

  @ApiOperation({ summary: "发布每日作业", description: "教师专用，创建并发布一项课程 Day 作业" })
  @Post()
  create(
    @CurrentUser() actor: QuestActor,
    @Body() body: CreateTeacherTaskDto
  ) {
    return this.questsService.create(actor, body);
  }
}
