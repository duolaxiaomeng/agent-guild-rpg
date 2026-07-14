import { Inject, Injectable } from "@nestjs/common";
import { PrismaService } from "../../../prisma/prisma.service";

/** Time windows (in milliseconds) for status derivation. */
const WORKING_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const ONLINE_WINDOW_MS = 30 * 60 * 1000; // 30 minutes
const IDLE_WINDOW_MS = 2 * 60 * 60 * 1000; // 2 hours

/** Default zone for student agents. */
const DEFAULT_ZONE = "workstations";

export type AvatarStatus =
  | "online"
  | "working"
  | "reviewing"
  | "idle"
  | "offline";

export type AvatarZone =
  | "lobby"
  | "workstations"
  | "collab-room"
  | "review-station";

export type AvatarState = {
  studentId: string;
  displayName: string;
  status: AvatarStatus;
  currentZone: AvatarZone;
  lastActiveAt: string | null;
  activitySummary: string;
};

@Injectable()
export class AgentAvatarService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService
  ) {}

  /**
   * Derive the avatar state for a single student.
   * Status is computed from recent submissions, reviews and memory activity.
   */
  async getAvatarState(studentId: string): Promise<AvatarState | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: studentId },
      select: { id: true, displayName: true, isOnline: true }
    });

    if (!user) {
      return null;
    }

    return this.deriveAvatarState(user.id, user.displayName, user.isOnline);
  }

  /**
   * Get all student avatars (every student in the system).
   * Optionally filter by zone.
   * Uses batch queries to avoid N+1 problems.
   */
  async getAvatars(zone?: AvatarZone): Promise<AvatarState[]> {
    const students = await this.prisma.user.findMany({
      where: { role: "student" },
      select: { id: true, displayName: true, isOnline: true }
    });

    const studentIds = students.map((s) => s.id);
    const now = Date.now();

    // Batch queries for ALL students at once
    const [recentSubmissions, pendingReviews, recentMemories, idleChecks] =
      await Promise.all([
        this.prisma.agentSubmission.findMany({
          where: {
            studentId: { in: studentIds },
            submittedAt: { gte: new Date(now - WORKING_WINDOW_MS) }
          },
          orderBy: { submittedAt: "desc" },
          select: { studentId: true, id: true, workSummary: true, submittedAt: true }
        }),
        this.prisma.reviewResult.findMany({
          where: {
            submission: { studentId: { in: studentIds } },
            status: { in: ["queued", "ai_reviewed"] }
          },
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            status: true,
            suggestedScore: true,
            createdAt: true,
            submission: { select: { studentId: true, workSummary: true } }
          }
        }),
        this.prisma.agentMemory.findMany({
          where: {
            studentId: { in: studentIds },
            createdAt: { gte: new Date(now - ONLINE_WINDOW_MS) }
          },
          orderBy: { createdAt: "desc" },
          select: { studentId: true, id: true, content: true, createdAt: true }
        }),
        this.prisma.agentSubmission.findMany({
          where: {
            studentId: { in: studentIds },
            submittedAt: { gte: new Date(now - IDLE_WINDOW_MS) }
          },
          orderBy: { submittedAt: "desc" },
          select: { studentId: true, submittedAt: true }
        })
      ]);

    // Group by studentId — first entry per student is the most recent (already ordered desc)
    const submissionsByStudent = this.groupByField(recentSubmissions, "studentId");
    const reviewsByStudent = this.groupByFn(pendingReviews, (r) => r.submission.studentId);
    const memoriesByStudent = this.groupByField(recentMemories, "studentId");
    const idleByStudent = this.groupByField(idleChecks, "studentId");

    const states: AvatarState[] = [];

    for (const student of students) {
      const state = this.deriveAvatarStateFromBatch(
        student.id,
        student.displayName,
        student.isOnline,
        submissionsByStudent.get(student.id)?.[0] ?? null,
        reviewsByStudent.get(student.id)?.[0] ?? null,
        memoriesByStudent.get(student.id)?.[0] ?? null,
        idleByStudent.get(student.id)?.[0] ?? null
      );

      if (zone && state.currentZone !== zone) {
        continue;
      }

      states.push(state);
    }

    return states;
  }

  /**
   * Get avatars for a specific zone.
   */
  async getAvatarsByZone(zone: AvatarZone): Promise<AvatarState[]> {
    return this.getAvatars(zone);
  }

  /**
   * Derive avatar state from pre-fetched batch data (no DB queries).
   */
  private deriveAvatarStateFromBatch(
    studentId: string,
    displayName: string,
    isOnline: boolean,
    recentSubmission: { id: string; workSummary: string; submittedAt: Date } | null,
    pendingReview: { id: string; status: string; suggestedScore: number | null; createdAt: Date; submission: { workSummary: string } } | null,
    recentMemory: { id: string; content: string; createdAt: Date } | null,
    idleCheck: { submittedAt: Date } | null
  ): AvatarState {
    if (!isOnline) {
      return {
        studentId,
        displayName,
        status: "offline",
        currentZone: DEFAULT_ZONE as AvatarZone,
        lastActiveAt: null,
        activitySummary: "离线"
      };
    }

    // 1. Working — recent submission
    if (recentSubmission) {
      return {
        studentId,
        displayName,
        status: "working",
        currentZone: DEFAULT_ZONE as AvatarZone,
        lastActiveAt: recentSubmission.submittedAt.toISOString(),
        activitySummary:
          recentSubmission.workSummary.slice(0, 60) || "正在提交任务..."
      };
    }

    // 2. Reviewing — pending review
    if (pendingReview) {
      const isAiReviewed = pendingReview.status === "ai_reviewed";
      return {
        studentId,
        displayName,
        status: "reviewing",
        currentZone: DEFAULT_ZONE as AvatarZone,
        lastActiveAt: pendingReview.createdAt.toISOString(),
        activitySummary: isAiReviewed
          ? `AI 初评完成，等待老师裁定 (建议分数 ${pendingReview.suggestedScore ?? "-"})`
          : "正在排队等待 AI 初评..."
      };
    }

    // 3. Online — recent activity
    if (recentMemory) {
      return {
        studentId,
        displayName,
        status: "online",
        currentZone: DEFAULT_ZONE as AvatarZone,
        lastActiveAt: recentMemory.createdAt.toISOString(),
        activitySummary: recentMemory.content.slice(0, 60) || "在线活跃"
      };
    }

    // 4. Idle — online but no recent activity within IDLE_WINDOW
    if (idleCheck) {
      return {
        studentId,
        displayName,
        status: "idle",
        currentZone: DEFAULT_ZONE as AvatarZone,
        lastActiveAt: idleCheck.submittedAt.toISOString(),
        activitySummary: "空闲"
      };
    }

    // 5. Default idle for online students with no activity at all
    return {
      studentId,
      displayName,
      status: "idle",
      currentZone: DEFAULT_ZONE as AvatarZone,
      lastActiveAt: null,
      activitySummary: "空闲"
    };
  }

  /**
   * Derive avatar state from Prisma queries (used for single-student lookup).
   *
   * Status precedence (highest first):
   *   1. working   — submission created within WORKING_WINDOW
   *   2. reviewing — has a pending review (queued or ai_reviewed, not teacher_decided)
   *   3. online    — activity (memory/submission) within ONLINE_WINDOW
   *   4. idle      — online but no recent activity
   *   5. offline   — user.isOnline === false
   */
  private async deriveAvatarState(
    studentId: string,
    displayName: string,
    isOnline: boolean
  ): Promise<AvatarState> {
    if (!isOnline) {
      return {
        studentId,
        displayName,
        status: "offline",
        currentZone: DEFAULT_ZONE as AvatarZone,
        lastActiveAt: null,
        activitySummary: "离线"
      };
    }

    const now = Date.now();

    const [recentSubmission, pendingReview, recentMemory] = await Promise.all([
      this.prisma.agentSubmission.findFirst({
        where: {
          studentId,
          submittedAt: { gte: new Date(now - WORKING_WINDOW_MS) }
        },
        orderBy: { submittedAt: "desc" },
        select: { id: true, workSummary: true, submittedAt: true }
      }),
      this.prisma.reviewResult.findFirst({
        where: {
          submission: { studentId },
          status: { in: ["queued", "ai_reviewed"] }
        },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          status: true,
          suggestedScore: true,
          createdAt: true,
          submission: { select: { workSummary: true } }
        }
      }),
      this.prisma.agentMemory.findFirst({
        where: {
          studentId,
          createdAt: { gte: new Date(now - ONLINE_WINDOW_MS) }
        },
        orderBy: { createdAt: "desc" },
        select: { id: true, content: true, createdAt: true }
      })
    ]);

    // 1. Working — recent submission
    if (recentSubmission) {
      return {
        studentId,
        displayName,
        status: "working",
        currentZone: DEFAULT_ZONE as AvatarZone,
        lastActiveAt: recentSubmission.submittedAt.toISOString(),
        activitySummary:
          recentSubmission.workSummary.slice(0, 60) || "正在提交任务..."
      };
    }

    // 2. Reviewing — pending review
    if (pendingReview) {
      const isAiReviewed = pendingReview.status === "ai_reviewed";
      return {
        studentId,
        displayName,
        status: "reviewing",
        currentZone: DEFAULT_ZONE as AvatarZone,
        lastActiveAt: pendingReview.createdAt.toISOString(),
        activitySummary: isAiReviewed
          ? `AI 初评完成，等待老师裁定 (建议分数 ${pendingReview.suggestedScore ?? "-"})`
          : "正在排队等待 AI 初评..."
      };
    }

    // 3. Online — recent activity
    if (recentMemory) {
      return {
        studentId,
        displayName,
        status: "online",
        currentZone: DEFAULT_ZONE as AvatarZone,
        lastActiveAt: recentMemory.createdAt.toISOString(),
        activitySummary: recentMemory.content.slice(0, 60) || "在线活跃"
      };
    }

    // 4. Idle — online but no recent activity within IDLE_WINDOW
    const idleCheck = await this.prisma.agentSubmission.findFirst({
      where: {
        studentId,
        submittedAt: { gte: new Date(now - IDLE_WINDOW_MS) }
      },
      orderBy: { submittedAt: "desc" },
      select: { submittedAt: true }
    });

    if (idleCheck) {
      return {
        studentId,
        displayName,
        status: "idle",
        currentZone: DEFAULT_ZONE as AvatarZone,
        lastActiveAt: idleCheck.submittedAt.toISOString(),
        activitySummary: "空闲"
      };
    }

    // 5. Default idle for online students with no activity at all
    return {
      studentId,
      displayName,
      status: "idle",
      currentZone: DEFAULT_ZONE as AvatarZone,
      lastActiveAt: null,
      activitySummary: "空闲"
    };
  }

  private groupByField<T extends Record<string, unknown>>(
    items: T[],
    key: keyof T
  ): Map<string, T[]> {
    const map = new Map<string, T[]>();
    for (const item of items) {
      const k = String(item[key]);
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(item);
    }
    return map;
  }

  private groupByFn<T>(items: T[], keyFn: (item: T) => string): Map<string, T[]> {
    const map = new Map<string, T[]>();
    for (const item of items) {
      const k = keyFn(item);
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(item);
    }
    return map;
  }
}
