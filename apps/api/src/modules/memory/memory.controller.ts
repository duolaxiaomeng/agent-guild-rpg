import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Inject,
  Post,
  Query,
  UseGuards
} from "@nestjs/common";
import {
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min
} from "class-validator";
import { UserRole } from "@prisma/client";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { AuthGuard } from "../auth/auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import { MemoryService } from "./memory.service";

// R-015: Convert type aliases to class-validator DTOs
class ObserveBodyDto {
  @IsString()
  studentId!: string;

  @IsIn(["observation", "reflection", "plan"])
  type!: string;

  @IsString()
  content!: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(10)
  importance?: number;

  @IsOptional()
  @IsString()
  courseWorldId?: string;

  @IsOptional()
  @IsString()
  roomId?: string;

  @IsOptional()
  @IsString()
  agentSessionId?: string;

  @IsOptional()
  @IsString()
  taskId?: string;
}

class ReflectBodyDto {
  @IsString()
  studentId!: string;

  @IsOptional()
  @IsString()
  courseWorldId?: string;

  @IsOptional()
  @IsString()
  roomId?: string;

  @IsOptional()
  @IsString()
  agentSessionId?: string;

  @IsOptional()
  @IsString()
  taskId?: string;
}

@ApiTags("agent-memory")
@ApiBearerAuth()
@Controller("agent-memory")
@UseGuards(AuthGuard)
export class MemoryController {
  constructor(
    @Inject(MemoryService) private readonly memoryService: MemoryService
  ) {}

  @ApiOperation({ summary: "记录观察记忆", description: "学生记录一条观察记忆到自己的记忆流中" })
  @Post("observe")
  async observe(
    @Body() body: ObserveBodyDto,
    @CurrentUser() user: { id: string; role: UserRole; displayName: string }
  ) {
    if (user.role !== UserRole.student) {
      throw new ForbiddenException("Student access required");
    }

    if (body.studentId !== user.id) {
      throw new ForbiddenException(
        "body.studentId must match the current student session"
      );
    }

    const memory = await this.memoryService.observe(
      body.studentId,
      body.type,
      body.content,
      body.importance,
      "student",
      {
        courseWorldId: body.courseWorldId,
        roomId: body.roomId,
        agentSessionId: body.agentSessionId,
        taskId: body.taskId
      }
    );

    return {
      id: memory.id,
      studentId: memory.studentId,
      type: memory.type,
      content: memory.content,
      importance: memory.importance,
      courseWorldId: memory.courseWorldId,
      roomId: memory.roomId,
      agentSessionId: memory.agentSessionId,
      taskId: memory.taskId,
      createdAt: memory.createdAt.toISOString(),
      lastAccessedAt: memory.lastAccessedAt.toISOString()
    };
  }

  @ApiOperation({ summary: "检索记忆", description: "学生从自己的记忆流中检索与查询相关的记忆" })
  @Get("retrieve")
  async retrieve(
    @Query("studentId") studentId: string,
    @Query("query") query: string,
    @Query("limit") limit: string | undefined,
    @Query("courseWorldId") courseWorldId: string | undefined,
    @Query("roomId") roomId: string | undefined,
    @Query("agentSessionId") agentSessionId: string | undefined,
    @Query("taskId") taskId: string | undefined,
    @CurrentUser() user: { id: string; role: UserRole; displayName: string }
  ) {
    if (user.role !== UserRole.student) {
      throw new ForbiddenException("Student access required");
    }

    if (studentId !== user.id) {
      throw new ForbiddenException(
        "studentId must match the current student session"
      );
    }

    // R-033: Validate limit parameter — NaN check and upper bound
    let parsedLimit = limit ? parseInt(limit, 10) : 30;
    if (Number.isNaN(parsedLimit) || parsedLimit < 1) {
      parsedLimit = 30;
    }
    parsedLimit = Math.min(parsedLimit, 100);

    const memories = await this.memoryService.retrieve(
      studentId,
      query,
      parsedLimit,
      { courseWorldId, roomId, agentSessionId, taskId }
    );

    return memories;
  }

  @ApiOperation({ summary: "反思记忆", description: "学生对最近的记忆进行反思总结" })
  @Post("reflect")
  async reflect(
    @Body() body: ReflectBodyDto,
    @CurrentUser() user: { id: string; role: UserRole; displayName: string }
  ) {
    if (user.role !== UserRole.student) {
      throw new ForbiddenException("Student access required");
    }

    if (body.studentId !== user.id) {
      throw new ForbiddenException(
        "body.studentId must match the current student session"
      );
    }

    const result = await this.memoryService.reflect(body.studentId, {
      courseWorldId: body.courseWorldId,
      roomId: body.roomId,
      agentSessionId: body.agentSessionId,
      taskId: body.taskId
    });

    return result;
  }
}
