import {
  Controller,
  ForbiddenException,
  Get,
  Inject,
  Param,
  Query,
  UseGuards
} from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { AuthGuard } from "../../auth/auth.guard";
import { CurrentUser } from "../../auth/current-user.decorator";
import { LearningInsightService } from "./learning-insight.service";

@ApiTags("learning-insights")
@ApiBearerAuth()
@Controller("learning-insights")
@UseGuards(AuthGuard)
export class LearningInsightController {
  constructor(
    @Inject(LearningInsightService)
    private readonly insightService: LearningInsightService
  ) {}

  /**
   * GET /learning-insights/student/:studentId
   *
   * Students can only view their own insights.
   * Teachers can view any student's insights.
   */
  @ApiOperation({ summary: "获取学生学习洞察", description: "学生查看自己的学习洞察，教师可查看任意学生的洞察" })
  @Get("student/:studentId")
  async getStudentInsights(
    @Param("studentId") studentId: string,
    @CurrentUser() user: { id: string; role: UserRole; displayName: string }
  ) {
    if (user.role === UserRole.student && studentId !== user.id) {
      throw new ForbiddenException(
        "Students can only view their own learning insights"
      );
    }

    return this.insightService.getStudentInsights(studentId);
  }

  /**
   * GET /learning-insights/class?teacherId=...
   *
   * Only teachers can access class-level insights.
   */
  @ApiOperation({ summary: "获取班级学习洞察", description: "教师查看班级整体学习洞察概览" })
  @Get("class")
  async getClassInsights(
    @Query("teacherId") teacherId: string,
    @CurrentUser() user: { id: string; role: UserRole; displayName: string }
  ) {
    if (user.role !== UserRole.teacher) {
      throw new ForbiddenException("Teacher access required");
    }

    if (teacherId && teacherId !== user.id) {
      throw new ForbiddenException(
        "teacherId must match the current teacher session"
      );
    }

    return this.insightService.getClassInsights(user.id);
  }
}
