import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException
} from "@nestjs/common";
import {
  ClassroomEventType,
  HelpRequestCategory,
  HelpRequestStatus,
  ClassroomSessionStatus,
  ClassroomStageStatus,
  Prisma,
  UserRole
} from "@prisma/client";
import type {
  ClassroomSnapshot,
  ClassroomStage as ClassroomStageContract,
  ClassroomViewer
} from "contracts";
import { PrismaService } from "../../prisma/prisma.service";
import { RoomsService } from "../rooms/rooms.service";

export type ClassroomActor = {
  id: string;
  role: UserRole;
  displayName: string;
};

export type StageAction =
  | "start"
  | "pause"
  | "extend"
  | "complete"
  | "end_early"
  | "unlock_next";

export type CreateClassroomSessionInput = {
  courseWorldId: string;
  dayId: string;
  stages: Array<{
    title: string;
    description?: string;
    durationSeconds: number;
  }>;
};

export type CreateHelpRequestInput = {
  sessionId: string;
  category: "blocked" | "environment" | "question" | "review" | "other";
  message: string;
};

type ClassroomStageRecord = Prisma.ClassroomStageGetPayload<{}>;

export function getRemainingSeconds(
  stage: Pick<
    ClassroomStageRecord,
    | "status"
    | "durationSeconds"
    | "extensionSeconds"
    | "startedAt"
    | "pausedAt"
    | "accumulatedPauseSeconds"
  >,
  now: Date
): number | null {
  if (stage.status === ClassroomStageStatus.draft || !stage.startedAt) {
    return null;
  }

  const frozenAt = stage.status === ClassroomStageStatus.paused && stage.pausedAt
    ? stage.pausedAt
    : now;
  const elapsedSeconds = Math.max(
    0,
    Math.floor((frozenAt.getTime() - stage.startedAt.getTime()) / 1000) -
      stage.accumulatedPauseSeconds
  );

  return Math.max(
    0,
    stage.durationSeconds + stage.extensionSeconds - elapsedSeconds
  );
}

@Injectable()
export class ClassroomsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(RoomsService) private readonly roomsService: RoomsService
  ) {}

  async createSession(
    actor: ClassroomActor,
    input: CreateClassroomSessionInput
  ): Promise<ClassroomSnapshot> {
    this.assertTeacher(actor);
    if (!input.courseWorldId?.trim() || !input.dayId?.trim() || !input.stages?.length) {
      throw new UnprocessableEntityException("A classroom session needs at least one stage");
    }
    for (const stage of input.stages) {
      if (
        !stage.title?.trim() ||
        !Number.isInteger(stage.durationSeconds) ||
        stage.durationSeconds <= 0 ||
        stage.durationSeconds > 86400
      ) {
        throw new UnprocessableEntityException("Each classroom stage needs a valid title and duration");
      }
    }

    const courseWorld = await this.prisma.courseWorld.findUnique({
      where: { id: input.courseWorldId }
    });
    const day = await this.prisma.questDay.findUnique({ where: { id: input.dayId } });
    if (!courseWorld || !day || day.courseWorldId !== input.courseWorldId) {
      throw new NotFoundException("Course world or quest day not found");
    }

    const session = await this.prisma.$transaction(async (tx) => {
      const created = await tx.classroomSession.create({
        data: {
          courseWorldId: input.courseWorldId,
          dayId: input.dayId,
          teacherId: actor.id,
          status: ClassroomSessionStatus.draft,
          stages: {
            create: input.stages.map((stage, sortOrder) => ({
              title: stage.title.trim(),
              description: stage.description?.trim() ?? "",
              sortOrder,
              durationSeconds: stage.durationSeconds
            }))
          },
          staffAssignments: {
            create: { userId: actor.id, role: "teacher" }
          }
        },
        select: { id: true }
      });
      return created;
    });

    return this.getSnapshot(session.id, actor);
  }

  async getSnapshot(sessionId: string, actor: ClassroomActor): Promise<ClassroomSnapshot> {
    const session = await this.prisma.classroomSession.findUnique({
      where: { id: sessionId },
      include: {
        stages: { orderBy: { sortOrder: "asc" } },
        helpRequests: { orderBy: { createdAt: "asc" } },
        staffAssignments: true
      }
    });
    if (!session) {
      throw new NotFoundException("Classroom session not found");
    }

    const viewer = this.viewerFor(session, actor);
    const now = new Date();
    const stages = session.stages.map((stage) => this.mapStage(stage, now));
    const currentStageRecord = session.currentStageId
      ? session.stages.find((stage) => stage.id === session.currentStageId) ?? null
      : null;

    return {
      session: {
        id: session.id,
        courseWorldId: session.courseWorldId,
        dayId: session.dayId,
        status: session.status,
        version: session.version,
        currentStageId: session.currentStageId,
        startedAt: session.startedAt?.toISOString() ?? null,
        endedAt: session.endedAt?.toISOString() ?? null
      },
      currentStage: currentStageRecord
        ? this.mapStage(currentStageRecord, now)
        : null,
      stages,
      helpRequests: session.helpRequests
        .filter((help) => viewer.role !== "student" || help.studentId === actor.id)
        .map((help) => this.mapHelpRequest(help)),
      viewer,
      serverNow: now.toISOString()
    };
  }

  async getActiveSnapshot(actor: ClassroomActor): Promise<ClassroomSnapshot | null> {
    const session = await this.prisma.classroomSession.findFirst({
      where: {
        status: { not: ClassroomSessionStatus.completed },
        OR: [
          { teacherId: actor.id },
          { staffAssignments: { some: { userId: actor.id } } },
          { courseWorld: { isUnlocked: true } }
        ]
      },
      orderBy: { createdAt: "desc" },
      select: { id: true }
    });

    return session ? this.getSnapshot(session.id, actor) : null;
  }

  async listHelpRequests(sessionId: string, actor: ClassroomActor) {
    const session = await this.getSessionForHelp(sessionId, actor);
    const isAssignedAssistant = session.staffAssignments.some(
      (assignment) => assignment.userId === actor.id && assignment.role === "assistant"
    );
    const requests = await this.prisma.helpRequest.findMany({
      where: {
        sessionId,
        ...(actor.role === UserRole.student && !isAssignedAssistant && session.teacherId !== actor.id
          ? { studentId: actor.id }
          : {})
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }]
    });

    return requests.map((request) => this.mapHelpRequest(request));
  }

  async createHelpRequest(
    actor: ClassroomActor,
    input: CreateHelpRequestInput
  ) {
    if (actor.role !== UserRole.student) {
      throw new ForbiddenException("Only students can create help requests");
    }
    if (!input.sessionId?.trim() || !input.category || !input.message?.trim()) {
      throw new UnprocessableEntityException("A help request needs a category and message");
    }
    if (input.message.trim().length > 2000) {
      throw new UnprocessableEntityException("Help message is too long");
    }

    const created = await this.prisma.$transaction(async (tx) => {
      const session = await tx.classroomSession.findUnique({
        where: { id: input.sessionId },
        select: { id: true }
      });
      if (!session) throw new NotFoundException("Classroom session not found");

      const help = await tx.helpRequest.create({
        data: {
          sessionId: input.sessionId,
          studentId: actor.id,
          category: input.category,
          message: input.message.trim()
        }
      });
      await tx.classroomEvent.create({
        data: {
          sessionId: input.sessionId,
          actorId: actor.id,
          eventType: "help_created",
          targetId: help.id,
          payload: {
            category: input.category,
            message: input.message.trim()
          } as Prisma.InputJsonValue
        }
      });
      return help;
    });

    return this.mapHelpRequest(created);
  }

  async claimHelpRequest(
    helpRequestId: string,
    expectedVersion: number,
    actor: ClassroomActor
  ) {
    this.assertValidHelpVersion(expectedVersion);
    const result = await this.prisma.$transaction(async (tx) => {
      const help = await tx.helpRequest.findUnique({
        where: { id: helpRequestId },
        include: { session: { include: { staffAssignments: true } } }
      });
      if (!help) throw new NotFoundException("Help request not found");
      this.assertCanHandleHelp(help.session, actor);
      if (help.version !== expectedVersion || help.status !== "open") {
        throw new ConflictException("Help request is stale or already claimed");
      }

      const claimedAt = new Date();
      const updated = await tx.helpRequest.updateMany({
        where: { id: help.id, status: "open", version: expectedVersion },
        data: {
          status: "claimed",
          assigneeId: actor.id,
          claimedAt,
          version: { increment: 1 }
        }
      });
      if (updated.count !== 1) {
        throw new ConflictException("Help request is stale or already claimed");
      }

      await tx.classroomEvent.create({
        data: {
          sessionId: help.sessionId,
          actorId: actor.id,
          eventType: "help_claimed",
          targetId: help.id,
          payload: { expectedVersion } as Prisma.InputJsonValue
        }
      });

      return tx.helpRequest.findUniqueOrThrow({ where: { id: help.id } });
    });

    // The room grant is deliberately created through RoomsService so that
    // assistants enter the student's room through the existing access path.
    // A teacher may grant directly; an assigned assistant receives a support
    // grant through the dedicated service helper.
    try {
      await this.roomsService.createSupportGrant(
        `room-chat-${result.studentId}`,
        actor.id,
        actor.role,
        2
      );
    } catch {
      // Claim state is the classroom truth. A missing room should not roll it
      // back; the caller can still resolve the request from the queue.
    }

    return this.mapHelpRequest(result);
  }

  async resolveHelpRequest(
    helpRequestId: string,
    resolutionNote: string,
    expectedVersion: number,
    actor: ClassroomActor
  ) {
    this.assertValidHelpVersion(expectedVersion);
    if (!resolutionNote?.trim() || resolutionNote.trim().length > 2000) {
      throw new UnprocessableEntityException("A resolution note is required");
    }

    const resolved = await this.prisma.$transaction(async (tx) => {
      const help = await tx.helpRequest.findUnique({
        where: { id: helpRequestId },
        include: { session: { include: { staffAssignments: true } } }
      });
      if (!help) throw new NotFoundException("Help request not found");
      this.assertCanHandleHelp(help.session, actor);
      if (help.status !== "claimed" || help.version !== expectedVersion) {
        throw new ConflictException("Only the current claimed help request can be resolved");
      }
      if (help.assigneeId !== actor.id && help.session.teacherId !== actor.id) {
        throw new ForbiddenException("Only the assignee or teacher can resolve help");
      }

      const updated = await tx.helpRequest.updateMany({
        where: { id: help.id, status: "claimed", version: expectedVersion },
        data: {
          status: "resolved",
          resolutionNote: resolutionNote.trim(),
          resolvedAt: new Date(),
          version: { increment: 1 }
        }
      });
      if (updated.count !== 1) {
        throw new ConflictException("Help request is stale or no longer claimable");
      }
      await tx.classroomEvent.create({
        data: {
          sessionId: help.sessionId,
          actorId: actor.id,
          eventType: "help_resolved",
          targetId: help.id,
          payload: {
            expectedVersion,
            resolutionNote: resolutionNote.trim()
          } as Prisma.InputJsonValue
        }
      });
      return tx.helpRequest.findUniqueOrThrow({ where: { id: help.id } });
    });

    return this.mapHelpRequest(resolved);
  }

  async cancelHelpRequest(
    helpRequestId: string,
    expectedVersion: number,
    actor: ClassroomActor
  ) {
    this.assertValidHelpVersion(expectedVersion);
    if (actor.role !== UserRole.student) {
      throw new ForbiddenException("Only the requesting student can cancel help");
    }

    const cancelled = await this.prisma.$transaction(async (tx) => {
      const help = await tx.helpRequest.findUnique({
        where: { id: helpRequestId }
      });
      if (!help) throw new NotFoundException("Help request not found");
      if (help.studentId !== actor.id) {
        throw new ForbiddenException("Students can only cancel their own help");
      }
      if (help.status !== "open" || help.version !== expectedVersion) {
        throw new ConflictException("Only an open help request can be cancelled");
      }
      const updated = await tx.helpRequest.updateMany({
        where: { id: help.id, studentId: actor.id, status: "open", version: expectedVersion },
        data: {
          status: "cancelled",
          version: { increment: 1 }
        }
      });
      if (updated.count !== 1) {
        throw new ConflictException("Help request is stale or already cancelled");
      }
      await tx.classroomEvent.create({
        data: {
          sessionId: help.sessionId,
          actorId: actor.id,
          eventType: "help_cancelled",
          targetId: help.id,
          payload: { expectedVersion } as Prisma.InputJsonValue
        }
      });
      return tx.helpRequest.findUniqueOrThrow({ where: { id: help.id } });
    });

    return this.mapHelpRequest(cancelled);
  }

  async startStage(
    stageId: string,
    expectedVersion: number,
    actor: ClassroomActor
  ): Promise<ClassroomSnapshot> {
    return this.applyStageAction(stageId, "start", expectedVersion, actor);
  }

  async pauseStage(
    stageId: string,
    expectedVersion: number,
    actor: ClassroomActor
  ): Promise<ClassroomSnapshot> {
    return this.applyStageAction(stageId, "pause", expectedVersion, actor);
  }

  async extendStage(
    stageId: string,
    seconds: number,
    expectedVersion: number,
    actor: ClassroomActor
  ): Promise<ClassroomSnapshot> {
    if (!Number.isInteger(seconds) || seconds <= 0) {
      throw new UnprocessableEntityException("Extension seconds must be a positive integer");
    }
    return this.applyStageAction(stageId, "extend", expectedVersion, actor, seconds);
  }

  async completeStage(
    stageId: string,
    expectedVersion: number,
    actor: ClassroomActor
  ): Promise<ClassroomSnapshot> {
    return this.applyStageAction(stageId, "complete", expectedVersion, actor);
  }

  async endStageEarly(
    stageId: string,
    expectedVersion: number,
    actor: ClassroomActor
  ): Promise<ClassroomSnapshot> {
    return this.applyStageAction(stageId, "end_early", expectedVersion, actor);
  }

  async unlockNextStage(
    stageId: string,
    expectedVersion: number,
    actor: ClassroomActor
  ): Promise<ClassroomSnapshot> {
    return this.applyStageAction(stageId, "unlock_next", expectedVersion, actor);
  }

  private async applyStageAction(
    stageId: string,
    action: StageAction,
    expectedVersion: number,
    actor: ClassroomActor,
    seconds?: number
  ): Promise<ClassroomSnapshot> {
    this.assertTeacher(actor);
    if (!Number.isInteger(expectedVersion) || expectedVersion < 0) {
      throw new UnprocessableEntityException("expectedVersion must be a non-negative integer");
    }

    const sessionId = await this.prisma.$transaction(async (tx) => {
      const stage = await tx.classroomStage.findUnique({
        where: { id: stageId },
        include: { session: true }
      });
      if (!stage) throw new NotFoundException("Classroom stage not found");
      if (stage.session.teacherId !== actor.id) {
        throw new ForbiddenException("Only the classroom teacher can control stages");
      }
      if (stage.version !== expectedVersion) {
        throw new ConflictException("Classroom stage version is stale");
      }

      const session = stage.session;
      const now = new Date();
      let eventType: ClassroomEventType;
      let targetId: string = stage.id;
      let nextStageId: string | null = null;

      if (action === "start") {
        if (
          stage.status !== ClassroomStageStatus.draft &&
          stage.status !== ClassroomStageStatus.paused
        ) {
          throw new ConflictException("Only a draft or paused stage can be started");
        }
        if (session.currentStageId && session.currentStageId !== stage.id) {
          const current = await tx.classroomStage.findUnique({ where: { id: session.currentStageId } });
          if (
            current &&
            (current.status === ClassroomStageStatus.running ||
              current.status === ClassroomStageStatus.paused)
          ) {
            throw new ConflictException("Another classroom stage is still active");
          }
        }
        const resumePauseSeconds = stage.status === ClassroomStageStatus.paused && stage.pausedAt
          ? Math.max(0, Math.floor((now.getTime() - stage.pausedAt.getTime()) / 1000))
          : 0;
        await tx.classroomStage.update({
          where: { id: stage.id },
          data: {
            status: ClassroomStageStatus.running,
            startedAt: stage.startedAt ?? now,
            pausedAt: null,
            accumulatedPauseSeconds: { increment: resumePauseSeconds },
            version: { increment: 1 }
          }
        });
        await tx.classroomSession.update({
          where: { id: session.id },
          data: {
            status: ClassroomSessionStatus.live,
            currentStageId: stage.id,
            startedAt: session.startedAt ?? now,
            version: { increment: 1 }
          }
        });
        eventType = "stage_started";
      } else if (action === "pause") {
        if (stage.status !== ClassroomStageStatus.running || !stage.startedAt) {
          throw new ConflictException("Only a running stage can be paused");
        }
        await tx.classroomStage.update({
          where: { id: stage.id },
          data: {
            status: ClassroomStageStatus.paused,
            pausedAt: now,
            version: { increment: 1 }
          }
        });
        await tx.classroomSession.update({
          where: { id: session.id },
          data: { version: { increment: 1 } }
        });
        eventType = "stage_paused";
      } else if (action === "extend") {
        if (
          stage.status !== ClassroomStageStatus.running &&
          stage.status !== ClassroomStageStatus.paused
        ) {
          throw new ConflictException("Only an active stage can be extended");
        }
        await tx.classroomStage.update({
          where: { id: stage.id },
          data: {
            extensionSeconds: { increment: seconds ?? 0 },
            version: { increment: 1 }
          }
        });
        await tx.classroomSession.update({
          where: { id: session.id },
          data: { version: { increment: 1 } }
        });
        eventType = "stage_extended";
      } else if (action === "complete" || action === "end_early") {
        if (
          stage.status !== ClassroomStageStatus.running &&
          stage.status !== ClassroomStageStatus.paused
        ) {
          throw new ConflictException("Only an active stage can be completed");
        }
        const status = action === "complete"
          ? ClassroomStageStatus.completed
          : ClassroomStageStatus.ended_early;
        await tx.classroomStage.update({
          where: { id: stage.id },
          data: { status, pausedAt: null, version: { increment: 1 } }
        });
        await tx.classroomSession.update({
          where: { id: session.id },
          data: { version: { increment: 1 } }
        });
        eventType = action === "complete" ? "stage_completed" : "stage_ended_early";
      } else {
        if (
          stage.status !== ClassroomStageStatus.completed &&
          stage.status !== ClassroomStageStatus.ended_early
        ) {
          throw new ConflictException("Complete the current stage before unlocking the next one");
        }
        const nextStage = await tx.classroomStage.findFirst({
          where: { sessionId: session.id, sortOrder: { gt: stage.sortOrder } },
          orderBy: { sortOrder: "asc" }
        });
        if (!nextStage) {
          throw new ConflictException("There is no next classroom stage");
        }
        nextStageId = nextStage.id;
        targetId = nextStage.id;
        await tx.classroomSession.update({
          where: { id: session.id },
          data: { currentStageId: nextStage.id, version: { increment: 1 } }
        });
        eventType = "stage_unlocked";
      }

      await tx.classroomEvent.create({
        data: {
          sessionId: session.id,
          actorId: actor.id,
          eventType,
          targetId,
          payload: {
            action,
            expectedVersion,
            seconds: seconds ?? null,
            nextStageId
          } as Prisma.InputJsonValue
        }
      });

      return session.id;
    });

    return this.getSnapshot(sessionId, actor);
  }

  private mapStage(stage: ClassroomStageRecord, now: Date): ClassroomStageContract {
    return {
      id: stage.id,
      title: stage.title,
      description: stage.description,
      sortOrder: stage.sortOrder,
      durationSeconds: stage.durationSeconds,
      extensionSeconds: stage.extensionSeconds,
      status: stage.status,
      version: stage.version,
      startedAt: stage.startedAt?.toISOString() ?? null,
      pausedAt: stage.pausedAt?.toISOString() ?? null,
      accumulatedPauseSeconds: stage.accumulatedPauseSeconds,
      remainingSeconds: getRemainingSeconds(stage, now)
    };
  }

  private mapHelpRequest(help: {
    id: string;
    sessionId: string;
    studentId: string;
    category: HelpRequestCategory;
    message: string;
    status: HelpRequestStatus;
    assigneeId: string | null;
    resolutionNote: string | null;
    createdAt: Date;
    claimedAt: Date | null;
    resolvedAt: Date | null;
    version: number;
  }) {
    return {
      id: help.id,
      sessionId: help.sessionId,
      studentId: help.studentId,
      category: help.category,
      message: help.message,
      status: help.status,
      assigneeId: help.assigneeId,
      resolutionNote: help.resolutionNote,
      createdAt: help.createdAt.toISOString(),
      claimedAt: help.claimedAt?.toISOString() ?? null,
      resolvedAt: help.resolvedAt?.toISOString() ?? null,
      version: help.version
    };
  }

  private async getSessionForHelp(sessionId: string, actor: ClassroomActor) {
    const session = await this.prisma.classroomSession.findUnique({
      where: { id: sessionId },
      include: { staffAssignments: true }
    });
    if (!session) throw new NotFoundException("Classroom session not found");
    if (
      actor.role === UserRole.teacher &&
      session.teacherId !== actor.id
    ) {
      throw new ForbiddenException("Only the classroom teacher can view help");
    }
    if (
      actor.role === UserRole.student &&
      session.teacherId !== actor.id &&
      !session.staffAssignments.some((assignment) => assignment.userId === actor.id)
    ) {
      // Students are allowed to see their own requests, but never another
      // class's help queue. The caller's studentId filter keeps the response
      // private while preserving the student-facing status bar.
      return session;
    }
    return session;
  }

  private assertCanHandleHelp(
    session: {
      teacherId: string;
      staffAssignments: Array<{ userId: string; role: string }>;
    },
    actor: ClassroomActor
  ) {
    if (session.teacherId === actor.id) return;
    if (
      actor.role === UserRole.student &&
      session.staffAssignments.some(
        (assignment) => assignment.userId === actor.id && assignment.role === "assistant"
      )
    ) {
      return;
    }
    throw new ForbiddenException("Only the classroom teacher or assigned assistant can handle help");
  }

  private assertValidHelpVersion(expectedVersion: number) {
    if (!Number.isInteger(expectedVersion) || expectedVersion < 0) {
      throw new UnprocessableEntityException("expectedVersion must be a non-negative integer");
    }
  }

  private viewerFor(
    session: {
      teacherId: string;
      staffAssignments: Array<{ userId: string; role: string }>;
    },
    actor: ClassroomActor
  ): ClassroomViewer {
    if (session.teacherId === actor.id) {
      return { role: "teacher", canControlStages: true, canHandleHelp: true };
    }
    const assignment = session.staffAssignments.find((item) => item.userId === actor.id);
    if (assignment?.role === "assistant") {
      return { role: "assistant", canControlStages: false, canHandleHelp: true };
    }
    return { role: "student", canControlStages: false, canHandleHelp: false };
  }

  private assertTeacher(actor: ClassroomActor) {
    if (actor.role !== UserRole.teacher) {
      throw new ForbiddenException("Only teachers can control classroom stages");
    }
  }
}
