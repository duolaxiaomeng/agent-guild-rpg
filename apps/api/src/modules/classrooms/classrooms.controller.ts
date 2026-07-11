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
  IsIn,
  ValidateNested
} from "class-validator";
import { Type } from "class-transformer";
import { AuthGuard } from "../auth/auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import {
  ClassroomsService,
  type ClassroomActor,
  type CreateClassroomSessionInput,
  type CreateHelpRequestInput
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

class CreateHelpRequestDto {
  @IsString()
  sessionId!: string;

  @IsString()
  @IsIn(["blocked", "environment", "question", "review", "other"])
  category!: CreateHelpRequestInput["category"];

  @IsString()
  message!: string;
}

class ResolveHelpRequestDto extends ExpectedVersionDto {
  @IsString()
  resolutionNote!: string;
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

  @ApiOperation({ summary: "获取课堂求助队列" })
  @Get("sessions/:id/help-requests")
  listHelpRequests(@Param("id") id: string, @CurrentUser() actor: ClassroomActor) {
    return this.classroomsService.listHelpRequests(id, actor);
  }

  @ApiOperation({ summary: "创建学生求助" })
  @Post("help-requests")
  createHelpRequest(
    @Body() body: CreateHelpRequestDto,
    @CurrentUser() actor: ClassroomActor
  ) {
    return this.classroomsService.createHelpRequest(actor, body as CreateHelpRequestInput);
  }

  @ApiOperation({ summary: "认领课堂求助" })
  @Post("help-requests/:id/claim")
  claimHelpRequest(
    @Param("id") id: string,
    @Body() body: ExpectedVersionDto,
    @CurrentUser() actor: ClassroomActor
  ) {
    return this.classroomsService.claimHelpRequest(id, body.expectedVersion, actor);
  }

  @ApiOperation({ summary: "解决课堂求助" })
  @Post("help-requests/:id/resolve")
  resolveHelpRequest(
    @Param("id") id: string,
    @Body() body: ResolveHelpRequestDto,
    @CurrentUser() actor: ClassroomActor
  ) {
    return this.classroomsService.resolveHelpRequest(
      id,
      body.resolutionNote,
      body.expectedVersion,
      actor
    );
  }

  @ApiOperation({ summary: "取消学生求助" })
  @Post("help-requests/:id/cancel")
  cancelHelpRequest(
    @Param("id") id: string,
    @Body() body: ExpectedVersionDto,
    @CurrentUser() actor: ClassroomActor
  ) {
    return this.classroomsService.cancelHelpRequest(id, body.expectedVersion, actor);
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
