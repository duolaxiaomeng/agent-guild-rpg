import {
  BadRequestException,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Query
} from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";

@Controller("chat")
export class ChatController {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService
  ) {}

  @Get()
  async getOverview(@Query("studentId") studentId?: string) {
    if (!studentId) {
      throw new BadRequestException("studentId is required");
    }

    const student = await this.prisma.user.findUnique({
      where: { id: studentId },
      include: {
        agentSessions: {
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: 1
        },
        submissions: {
          include: {
            day: true,
            reviewResult: true
          },
          orderBy: [{ submittedAt: "desc" }, { id: "desc" }],
          take: 1
        }
      }
    });

    if (!student) {
      throw new NotFoundException("Student not found");
    }

    const contributionLogs = await this.prisma.contributionLog.findMany({
      where: {
        targetUserId: studentId
      },
      include: {
        actor: true
      },
      orderBy: [{ points: "desc" }, { id: "asc" }]
    });

    const latestSession = student.agentSessions[0];
    const latestSubmission = student.submissions[0];
    const contributionByActor = new Map<
      string,
      { studentId: string; studentName: string; points: number }
    >();

    for (const log of contributionLogs) {
      const existing = contributionByActor.get(log.actorId);

      if (existing) {
        existing.points += log.points;
        continue;
      }

      contributionByActor.set(log.actorId, {
        studentId: log.actorId,
        studentName: log.actor.displayName,
        points: log.points
      });
    }

    return {
      studentId: student.id,
      studentName: student.displayName,
      agentLabel: this.toAgentLabel(latestSession?.provider),
      sessionStatus: latestSession?.status ?? "failed",
      sessionSummary:
        latestSubmission?.conversationSummary ?? "今天还没有新的会话摘要。",
      latestSubmission: latestSubmission
        ? {
            id: latestSubmission.id,
            statusLabel:
              latestSubmission.reviewResult?.reviewerId == null
                ? "待老师审核"
                : "已完成裁定",
            submittedAt: latestSubmission.submittedAt.toISOString(),
            dayLabel: this.toDayLabel(latestSubmission.day.id)
          }
        : null,
      collaborationGuests: [...contributionByActor.values()]
        .sort((left, right) => right.points - left.points)
        .map((guest) => ({
          studentId: guest.studentId,
          studentName: guest.studentName,
          contributionLabel: `协作贡献 ${guest.points}`
        }))
    };
  }

  private toAgentLabel(provider?: string) {
    if (provider === "claude-code") {
      return "Claude Code";
    }

    if (provider === "codex") {
      return "Codex";
    }

    return provider ?? "Unknown Agent";
  }

  private toDayLabel(dayId: string) {
    return `Day ${dayId.replace("day-", "")}`;
  }
}
