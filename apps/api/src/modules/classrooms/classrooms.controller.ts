import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  UseGuards
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import {
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested
} from "class-validator";
import { Type } from "class-transformer";
import { AuthGuard } from "../auth/auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import {
  ClassroomsService,
  type ClassroomActor,
  type CreateClassroomSessionInput
} from "./classrooms.service";

class CreateStageDto {
  @IsString()
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsInt()
  @Min(1)
  @Max(86400)
  durationSeconds!: number;
}

class CreateSessionDto {
  @IsString()
  courseWorldId!: string;

  @IsString()
  dayId!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateStageDto)
  stages!: CreateStageDto[];
}

class ExpectedVersionDto {
  @IsInt()
  @Min(0)
  expectedVersion!: number;
}

class ExtendStageDto extends ExpectedVersionDto {
  @IsInt()
  @Min(1)
  @Max(86400)
  seconds!: number;
}

@ApiTags("classrooms")
@ApiBearerAuth()
@Controller("classrooms")
@UseGuards(AuthGuard)
export class ClassroomsController {
  constructor(
    @Inject(ClassroomsService) private readonly classroomsService: ClassroomsService
  ) {}

  @ApiOperation({ summary: "创建课堂场次" })
  @Post("sessions")
  createSession(
    @Body() body: CreateSessionDto,
    @CurrentUser() actor: ClassroomActor
  ) {
    return this.classroomsService.createSession(actor, body as CreateClassroomSessionInput);
  }

  @ApiOperation({ summary: "获取当前课堂" })
  @Get("sessions/active")
  getActive(@CurrentUser() actor: ClassroomActor) {
    return this.classroomsService.getActiveSnapshot(actor);
  }

  @ApiOperation({ summary: "获取课堂快照" })
  @Get("sessions/:id")
  getSnapshot(@Param("id") id: string, @CurrentUser() actor: ClassroomActor) {
    return this.classroomsService.getSnapshot(id, actor);
  }

  @ApiOperation({ summary: "开始课堂阶段" })
  @Post("stages/:id/start")
  startStage(
    @Param("id") id: string,
    @Body() body: ExpectedVersionDto,
    @CurrentUser() actor: ClassroomActor
  ) {
    return this.classroomsService.startStage(id, body.expectedVersion, actor);
  }

  @ApiOperation({ summary: "暂停课堂阶段" })
  @Post("stages/:id/pause")
  pauseStage(
    @Param("id") id: string,
    @Body() body: ExpectedVersionDto,
    @CurrentUser() actor: ClassroomActor
  ) {
    return this.classroomsService.pauseStage(id, body.expectedVersion, actor);
  }

  @ApiOperation({ summary: "延长课堂阶段" })
  @Post("stages/:id/extend")
  extendStage(
    @Param("id") id: string,
    @Body() body: ExtendStageDto,
    @CurrentUser() actor: ClassroomActor
  ) {
    return this.classroomsService.extendStage(id, body.seconds, body.expectedVersion, actor);
  }

  @ApiOperation({ summary: "完成课堂阶段" })
  @Post("stages/:id/complete")
  completeStage(
    @Param("id") id: string,
    @Body() body: ExpectedVersionDto,
    @CurrentUser() actor: ClassroomActor
  ) {
    return this.classroomsService.completeStage(id, body.expectedVersion, actor);
  }

  @ApiOperation({ summary: "提前结束课堂阶段" })
  @Post("stages/:id/end-early")
  endStageEarly(
    @Param("id") id: string,
    @Body() body: ExpectedVersionDto,
    @CurrentUser() actor: ClassroomActor
  ) {
    return this.classroomsService.endStageEarly(id, body.expectedVersion, actor);
  }

  @ApiOperation({ summary: "解锁下一课堂阶段" })
  @Post("stages/:id/unlock-next")
  unlockNextStage(
    @Param("id") id: string,
    @Body() body: ExpectedVersionDto,
    @CurrentUser() actor: ClassroomActor
  ) {
    return this.classroomsService.unlockNextStage(id, body.expectedVersion, actor);
  }
}
