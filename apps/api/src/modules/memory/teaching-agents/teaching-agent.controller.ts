import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Inject,
  Logger,
  Post,
  UseGuards,
} from "@nestjs/common";
import {
  IsArray,
  IsOptional,
  IsString,
} from "class-validator";
import { UserRole } from "@prisma/client";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { PrismaService } from "../../../prisma/prisma.service";
import { AuthGuard } from "../../auth/auth.guard";
import { CurrentUser } from "../../auth/current-user.decorator";
import { MemoryService } from "../memory.service";
import { SopEngineService, type SopInput, type SopResult } from "./sop-engine.service";
import {
  TeachingAgentService,
  type CollaborationResult,
} from "./teaching-agent.service";
import type { AgentRoleKey } from "./agent-roles";

// R-015: Convert type aliases to class-validator DTOs
class ReviewBodyDto {
  @IsString()
  submissionId!: string;
}

class QuestionBodyDto {
  @IsString()
  studentId!: string;

  @IsString()
  question!: string;
}

class QuestCompleteBodyDto {
  @IsString()
  studentId!: string;

  @IsString()
  questId!: string;
}

class CollaborateBodyDto {
  @IsArray()
  @IsString({ each: true })
  agents!: AgentRoleKey[];

  @IsString()
  topic!: string;

  @IsOptional()
  @IsString()
  context?: string;
}

@ApiTags("teaching-agents")
@ApiBearerAuth()
@Controller("teaching-agents")
@UseGuards(AuthGuard)
export class TeachingAgentController {
  private readonly logger = new Logger(TeachingAgentController.name);

  constructor(
    @Inject(SopEngineService) private readonly sopEngine: SopEngineService,
    @Inject(TeachingAgentService)
    private readonly agentService: TeachingAgentService,
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(MemoryService) private readonly memoryService: MemoryService,
  ) {}

  /**
   * POST /teaching-agents/review
   * Body: { submissionId }
   *
   * Trigger the submission-review SOP for a given submission.
   * The SOP fetches submission details, runs multi-step review,
   * and stores the result in AgentMemory.
   */
  @ApiOperation({
    summary: "触发提交评审 SOP",
    description: "对指定提交执行多步骤评审 SOP，获取提交详情、运行多步评审并存储结果到 Agent 记忆",
  })
  @Post("review")
  async runReview(
    @Body() body: ReviewBodyDto,
    @CurrentUser()
    user: { id: string; role: UserRole; displayName: string },
  ): Promise<SopResult> {
    const submission = await this.prisma.agentSubmission.findUnique({
      where: { id: body.submissionId },
    });

    if (!submission) {
      const degradedResult: SopResult = {
        sopType: "submission-review",
        steps: [],
        finalOutput: `提交 ${body.submissionId} 不存在，无法执行评审 SOP。`,
        completedAt: new Date().toISOString(),
        degraded: true,
        llmUsed: false,
      };
      return degradedResult;
    }

    // R-008: Only teachers or the submission's owner can trigger review
    if (user.role === UserRole.student && submission.studentId !== user.id) {
      throw new ForbiddenException("无权对其他学生的提交进行评审");
    }

    const input: SopInput = {
      submissionId: submission.id,
      workSummary: submission.workSummary,
      selfReflection: submission.selfReflection,
      artifacts: submission.artifacts as Array<{
        kind: string;
        label: string;
        url: string;
      }>,
      agentEvaluationHints: submission.agentEvaluationHints as string[],
    };

    const result = await this.sopEngine.runSop("submission-review", input);

    // R-017: use .catch instead of queueMicrotask + void
    this.memoryService
      .observe(
        submission.studentId,
        "observation",
        `SOP评审结果 [submission:${submission.id}]: ${result.finalOutput}`,
        7.0,
      )
      .catch((err: unknown) => {
        this.logger.error(
          `Memory observe failed for SOP review: ${err instanceof Error ? err.message : String(err)}`
        );
      });

    return result;
  }

  /**
   * POST /teaching-agents/question
   * Body: { studentId, question }
   *
   * Trigger the student-question SOP for a given question.
   */
  @ApiOperation({
    summary: "触发学生答疑 SOP",
    description: "对指定学生的问题执行答疑 SOP，生成解答并存储到 Agent 记忆",
  })
  @Post("question")
  async runQuestion(
    @Body() body: QuestionBodyDto,
    @CurrentUser()
    user: { id: string; role: UserRole; displayName: string },
  ): Promise<SopResult> {
    if (user.role === UserRole.student && body.studentId !== user.id) {
      throw new ForbiddenException("无权以其他学生身份触发答疑");
    }

    const input: SopInput = {
      studentId: body.studentId,
      question: body.question,
    };

    const result = await this.sopEngine.runSop("student-question", input);

    // Persist SOP result to agent memory (async, non-blocking)
    // R-017: use .catch instead of queueMicrotask + void
    if (body.studentId) {
      this.memoryService
        .observe(
          body.studentId,
          "observation",
          `SOP答疑结果 [问题:${body.question}]: ${result.finalOutput}`,
          5.0,
        )
        .catch((err: unknown) => {
          this.logger.error(
            `Memory observe failed for SOP question: ${err instanceof Error ? err.message : String(err)}`
          );
        });
    }

    return result;
  }

  /**
   * POST /teaching-agents/quest-complete
   * Body: { studentId, questId }
   *
   * Trigger the quest-completion SOP for a given quest.
   */
  @ApiOperation({
    summary: "触发关卡完成 SOP",
    description: "对指定学生的关卡执行完成报告 SOP，生成完成报告并存储到 Agent 记忆",
  })
  @Post("quest-complete")
  async runQuestCompletion(
    @Body() body: QuestCompleteBodyDto,
    @CurrentUser()
    user: { id: string; role: UserRole; displayName: string },
  ): Promise<SopResult> {
    if (user.role === UserRole.student && body.studentId !== user.id) {
      throw new ForbiddenException("无权以其他学生身份触发关卡完成");
    }

    const quest = await this.prisma.questDay.findUnique({
      where: { id: body.questId },
    });

    // Fetch the student's latest submission for this quest
    const latestSubmission = await this.prisma.agentSubmission.findFirst({
      where: {
        studentId: body.studentId,
        dayId: body.questId,
      },
      orderBy: { submittedAt: "desc" },
    });

    const input: SopInput = {
      studentId: body.studentId,
      questId: body.questId,
      questTitle: quest?.title,
      submissionSummary: latestSubmission?.workSummary,
    };

    const result = await this.sopEngine.runSop("quest-completion", input);

    // Persist SOP result to agent memory (async, non-blocking)
    // R-017: use .catch instead of queueMicrotask + void
    this.memoryService
      .observe(
        body.studentId,
        "observation",
        `SOP关卡完成报告 [quest:${body.questId}]: ${result.finalOutput}`,
        8.0,
      )
      .catch((err: unknown) => {
        this.logger.error(
          `Memory observe failed for SOP quest-complete: ${err instanceof Error ? err.message : String(err)}`
        );
      });

    return result;
  }

  /**
   * GET /teaching-agents/sop-types
   *
   * Returns the list of available SOP types with metadata.
   */
  @ApiOperation({
    summary: "获取可用 SOP 类型",
    description: "返回所有可用的 SOP 类型及其元数据",
  })
  @Get("sop-types")
  getSopTypes() {
    return this.sopEngine.getSopTypes();
  }

  /**
   * POST /teaching-agents/collaborate
   * Body: { agents, topic, context? }
   *
   * Run a multi-agent collaboration on a given topic.
   */
  @ApiOperation({
    summary: "多 Agent 协作",
    description: "在指定主题上运行多 Agent 协作讨论，返回协作结果",
  })
  @Post("collaborate")
  async collaborate(
    @Body() body: CollaborateBodyDto,
    @CurrentUser()
    user: { id: string; role: UserRole; displayName: string },
  ): Promise<CollaborationResult> {
    // R-009: Only teachers can trigger multi-agent collaboration
    if (user.role !== UserRole.teacher) {
      throw new ForbiddenException("Teacher access required");
    }

    const agents = (body.agents ?? ["ta", "reviewer", "mentor"]).slice(0, 3);
    return this.agentService.collaborate(agents, body.topic, body.context);
  }
}
