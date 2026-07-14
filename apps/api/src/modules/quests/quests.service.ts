import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException
} from "@nestjs/common";
import {
  Prisma,
  QuestStatus,
  ReviewStatus,
  UserRole
} from "@prisma/client";
import type {
  CreateTeacherTaskInput,
  TeacherTaskProgressStatus
} from "contracts";
import { PrismaService } from "../../prisma/prisma.service";

export type QuestActor = {
  id: string;
  role: UserRole;
  displayName: string;
};

type QuestTaskRecord = Prisma.QuestDayGetPayload<{}>;

@Injectable()
export class QuestsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async list() {
    const quests = await this.prisma.questDay.findMany({
      orderBy: { id: "asc" }
    });

    return quests.map((quest) => this.toTask(quest));
  }

  async create(actor: QuestActor, input: CreateTeacherTaskInput) {
    this.assertTeacher(actor);

    const [existingTask, courseWorld] = await Promise.all([
      this.prisma.questDay.findUnique({
        where: { id: input.dayId },
        select: { id: true }
      }),
      this.prisma.courseWorld.findUnique({
        where: { id: input.courseWorldId },
        select: { id: true }
      })
    ]);

    if (existingTask) {
      throw new ConflictException(`Quest ${input.dayId} already exists`);
    }
    if (!courseWorld) {
      throw new NotFoundException(`Course world ${input.courseWorldId} was not found`);
    }

    const quest = await this.prisma.questDay.create({
      data: {
        id: input.dayId,
        courseWorldId: input.courseWorldId,
        title: input.title.trim(),
        status: QuestStatus[input.status],
        description: input.description.trim(),
        homework: input.homework.trim(),
        acceptanceCriteria: input.acceptanceCriteria.map((criterion) => criterion.trim()),
        dueAt: input.dueAt ? new Date(input.dueAt) : null,
        publishedAt: input.publishedAt ? new Date(input.publishedAt) : null,
        teacherId: actor.id
      }
    });

    return this.toTask(quest);
  }

  async progress(actor: QuestActor) {
    this.assertTeacher(actor);

    const [quests, students] = await Promise.all([
      this.prisma.questDay.findMany({
        include: {
          submissions: {
            include: { reviewResult: true },
            orderBy: [
              { submittedAt: "desc" },
              { id: "desc" }
            ]
          }
        },
        orderBy: { id: "asc" }
      }),
      this.prisma.user.findMany({
        where: { role: UserRole.student },
        select: { id: true, displayName: true },
        orderBy: { id: "asc" }
      })
    ]);

    return quests.map((quest) => {
      const latestSubmissionByStudent = new Map<
        string,
        (typeof quest.submissions)[number]
      >();
      for (const submission of quest.submissions) {
        if (!latestSubmissionByStudent.has(submission.studentId)) {
          latestSubmissionByStudent.set(submission.studentId, submission);
        }
      }

      const studentProgress = students.map((student) => {
        const submission = latestSubmissionByStudent.get(student.id);
        const isReviewed = submission?.reviewResult?.status === ReviewStatus.ai_reviewed
          || submission?.reviewResult?.status === ReviewStatus.teacher_decided;
        const status: TeacherTaskProgressStatus = !submission
          ? "not_started"
          : isReviewed
            ? "reviewed"
            : "submitted";
        const reviewedAt = isReviewed
          ? submission.reviewResult?.decidedAt
            ?? submission.reviewResult?.aiReviewedAt
            ?? null
          : null;

        return {
          studentId: student.id,
          displayName: student.displayName,
          status,
          submissionId: submission?.id ?? null,
          submittedAt: submission?.submittedAt.toISOString() ?? null,
          reviewedAt: reviewedAt?.toISOString() ?? null
        };
      });

      return {
        ...this.toTask(quest),
        summary: {
          total: studentProgress.length,
          notStarted: studentProgress.filter((item) => item.status === "not_started").length,
          submitted: studentProgress.filter((item) => item.status === "submitted").length,
          reviewed: studentProgress.filter((item) => item.status === "reviewed").length
        },
        students: studentProgress
      };
    });
  }

  private toTask(quest: QuestTaskRecord) {
    return {
      // Keep the original id field for existing Web clients while exposing the
      // explicit dayId used by the shared teacher-task contract.
      id: quest.id,
      courseWorldId: quest.courseWorldId,
      dayId: quest.id,
      title: quest.title,
      status: quest.status,
      description: quest.description,
      homework: quest.homework,
      acceptanceCriteria: this.toStringArray(quest.acceptanceCriteria),
      dueAt: quest.dueAt?.toISOString() ?? null,
      publishedAt: quest.publishedAt?.toISOString() ?? null,
      teacherId: quest.teacherId
    };
  }

  private toStringArray(value: Prisma.JsonValue) {
    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === "string")
      : [];
  }

  private assertTeacher(actor: QuestActor) {
    if (actor.role !== UserRole.teacher) {
      throw new ForbiddenException("Teacher access required");
    }
  }
}
