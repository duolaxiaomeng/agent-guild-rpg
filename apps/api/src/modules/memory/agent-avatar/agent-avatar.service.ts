import { Inject, Injectable, Optional } from "@nestjs/common";
import { AgentConnectorStatus, AgentTaskStatus, UserRole } from "@prisma/client";
import { PrismaService } from "../../../prisma/prisma.service";
import { PresenceService } from "../../realtime/presence.service";
import { resolveAgentVisualRole } from "../../agent-team/agent-team.mapping";

/** Time windows (in milliseconds) for status derivation. */
const ONLINE_WINDOW_MS = 30 * 60 * 1000; // 30 minutes
const IDLE_WINDOW_MS = 2 * 60 * 60 * 1000; // 2 hours
const AVATAR_CACHE_TTL_MS = 1_500;
const CONNECTOR_ONLINE_WINDOW_MS = 75 * 1000;

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
  ownerRole?: "teacher" | "student";
  agentRole?: string | null;
  visualRole?: "browser" | "coder" | "files" | "ops" | "lead" | null;
};

@Injectable()
export class AgentAvatarService {
  private readonly presence: PresenceService;
  private readonly avatarCache = new Map<
    string,
    { expiresAt: number; value: AvatarState[] }
  >();
  private readonly avatarLoads = new Map<string, Promise<AvatarState[]>>();

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Optional() @Inject(PresenceService) presence?: PresenceService
  ) {
    this.presence = presence ?? new PresenceService();
  }

  invalidateCache() {
    this.avatarCache.clear();
    this.avatarLoads.clear();
  }

  /**
   * Derive the avatar state for a single student.
   * Status is computed from recent submissions, reviews and memory activity.
   */
  async getAvatarState(studentId: string): Promise<AvatarState | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: studentId },
      select: {
        id: true,
        role: true,
        displayName: true,
        isOnline: true,
        agentTeamBinding: { select: { roleKey: true } },
        agentConnectors: {
          where: {
            status: AgentConnectorStatus.online,
            lastSeenAt: {
              gt: new Date(Date.now() - CONNECTOR_ONLINE_WINDOW_MS),
            },
          },
          take: 1,
          select: { id: true },
        },
      }
    });

    if (!user) {
      return null;
    }

    const state = await this.deriveAvatarState(
      user.id,
      user.displayName,
      this.presence.isOnline(user.id) || user.agentConnectors.length > 0,
    );
    return this.withWorldIdentity(
      state,
      user.id,
      user.role,
      user.agentTeamBinding?.roleKey,
    );
  }

  /**
   * Get all student avatars (every student in the system).
   * Optionally filter by zone.
   * Uses batch queries to avoid N+1 problems.
   */
  async getAvatars(zone?: AvatarZone): Promise<AvatarState[]> {
    const cacheKey = zone ?? "*";
    const cached = this.avatarCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value;
    }

    const existingLoad = this.avatarLoads.get(cacheKey);
    if (existingLoad) {
      return existingLoad;
    }

    const load = this.loadAvatars(zone)
      .then((value) => {
        this.avatarCache.set(cacheKey, {
          expiresAt: Date.now() + AVATAR_CACHE_TTL_MS,
          value
        });
        return value;
      })
      .finally(() => {
        this.avatarLoads.delete(cacheKey);
      });
    this.avatarLoads.set(cacheKey, load);
    return load;
  }

  private async loadAvatars(zone?: AvatarZone): Promise<AvatarState[]> {
    const onlineConnectors = await this.prisma.agentConnector.findMany({
      where: {
        status: AgentConnectorStatus.online,
        lastSeenAt: {
          gt: new Date(Date.now() - CONNECTOR_ONLINE_WINDOW_MS),
        },
      },
      select: { studentId: true },
    });
    const onlineUserIds = [
      ...new Set([
        ...this.presence.onlineUserIds(),
        ...onlineConnectors.map((connector) => connector.studentId),
      ]),
    ];
    if (onlineUserIds.length === 0) return [];

    const students = await this.prisma.user.findMany({
      where: {
        role: { in: [UserRole.student, UserRole.teacher] },
        id: { in: onlineUserIds },
      },
      select: {
        id: true,
        role: true,
        displayName: true,
        agentTeamBinding: { select: { roleKey: true } },
      }
    });

    const studentIds = students.map((s) => s.id);
    const now = Date.now();

    // Batch queries for ALL students at once
    const [activeTasks, pendingReviews, recentMemories, idleChecks] =
      await Promise.all([
        this.prisma.agentTask.findMany({
          where: {
            studentId: { in: studentIds },
            status: { in: [AgentTaskStatus.leased, AgentTaskStatus.running] },
          },
          orderBy: { updatedAt: "desc" },
          select: {
            studentId: true,
            id: true,
            runId: true,
            leasedAt: true,
            startedAt: true,
            updatedAt: true,
          },
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
    const tasksByStudent = this.groupByField(activeTasks, "studentId");
    const reviewsByStudent = this.groupByFn(pendingReviews, (r) => r.submission.studentId);
    const memoriesByStudent = this.groupByField(recentMemories, "studentId");
    const idleByStudent = this.groupByField(idleChecks, "studentId");

    const states: AvatarState[] = [];

    for (const student of students) {
      const state = this.deriveAvatarStateFromBatch(
        student.id,
        student.displayName,
        true,
        tasksByStudent.get(student.id)?.[0] ?? null,
        reviewsByStudent.get(student.id)?.[0] ?? null,
        memoriesByStudent.get(student.id)?.[0] ?? null,
        idleByStudent.get(student.id)?.[0] ?? null
      );
      const decoratedState = this.withWorldIdentity(
        state,
        student.id,
        student.role,
        student.agentTeamBinding?.roleKey,
      );

      if (zone && decoratedState.currentZone !== zone) {
        continue;
      }

      states.push(decoratedState);
    }

    return states;
  }

  /**
   * Get avatars for a specific zone.
   */
  async getAvatarsByZone(zone: AvatarZone): Promise<AvatarState[]> {
    return this.getAvatars(zone);
  }

  async moveAvatar(studentId: string, zone: AvatarZone): Promise<AvatarState | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: studentId },
      select: { id: true },
    });
    if (!user) return null;

    this.presence.setZone(studentId, zone);
    this.invalidateCache();
    return this.getAvatarState(studentId);
  }

  /**
   * Derive avatar state from pre-fetched batch data (no DB queries).
   */
  private deriveAvatarStateFromBatch(
    studentId: string,
    displayName: string,
    isOnline: boolean,
    activeTask: {
      id: string;
      runId: string;
      leasedAt: Date | null;
      startedAt: Date | null;
      updatedAt: Date;
    } | null,
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

    // 1. Working — a real connector task is leased or running.
    if (activeTask) {
      const activeAt = activeTask.startedAt ?? activeTask.leasedAt ?? activeTask.updatedAt;
      return {
        studentId,
        displayName,
        status: "working",
        currentZone: DEFAULT_ZONE as AvatarZone,
        lastActiveAt: activeAt.toISOString(),
        activitySummary: `正在执行本地 Agent 任务 ${activeTask.runId}`,
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
   *   1. working   — a connector task is leased or running
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

    const [activeTask, pendingReview, recentMemory] = await Promise.all([
      this.prisma.agentTask.findFirst({
        where: {
          studentId,
          status: { in: [AgentTaskStatus.leased, AgentTaskStatus.running] },
        },
        orderBy: { updatedAt: "desc" },
        select: {
          id: true,
          runId: true,
          leasedAt: true,
          startedAt: true,
          updatedAt: true,
        },
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

    // 1. Working — a real connector task is leased or running.
    if (activeTask) {
      const activeAt = activeTask.startedAt ?? activeTask.leasedAt ?? activeTask.updatedAt;
      return {
        studentId,
        displayName,
        status: "working",
        currentZone: DEFAULT_ZONE as AvatarZone,
        lastActiveAt: activeAt.toISOString(),
        activitySummary: `正在执行本地 Agent 任务 ${activeTask.runId}`,
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

  private withWorldIdentity(
    state: AvatarState,
    userId: string,
    accountRole: UserRole,
    roleKey?: string | null,
  ): AvatarState {
    const currentZone = (this.presence.getZone(userId) ?? state.currentZone) as AvatarZone;
    if (accountRole === UserRole.teacher) {
      return {
        ...state,
        currentZone,
        ownerRole: "teacher",
        agentRole: null,
        visualRole: "lead",
      };
    }

    const visualRole = roleKey ? resolveAgentVisualRole(roleKey) : null;
    return {
      ...state,
      currentZone,
      ownerRole: "student",
      agentRole: visualRole ? roleKey ?? null : null,
      visualRole,
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
