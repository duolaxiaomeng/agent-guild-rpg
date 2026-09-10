import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
  UnauthorizedException,
} from "@nestjs/common";
import {
  AgentTaskAttemptStatus,
  AgentTaskResourceClass,
  AgentTaskStatus,
  AgentSessionStatus,
  Prisma,
} from "@prisma/client";
import * as crypto from "crypto";
import { PrismaService } from "../../prisma/prisma.service";
import { AgentConnectorsService } from "../agent-connectors/agent-connectors.service";
import { AgentAvatarService } from "../memory/agent-avatar/agent-avatar.service";
import { AgentWorldService } from "../realtime/agent-world.service";
import { RealtimeGateway } from "../realtime/realtime.gateway";

const LEASE_DURATION_MS = 60_000;
const HEARTBEAT_INTERVAL_SECONDS = 15;
const PAUSED_BY_TEACHER = "paused by teacher";
const CLAIM_POLL_INTERVAL_MS = 1_000;
const CLAIM_POLL_JITTER_MS = 250;
const AGING_INTERVAL_MS = 60_000;

type ProviderBucket = {
  requestTokens: number;
  modelTokens: number;
  updatedAt: number;
};

type ProviderRateLimit = {
  rpm: number;
  tpm: number;
};

const taskWithDependencies = Prisma.validator<Prisma.AgentTaskDefaultArgs>()({
  include: {
    dependencies: {
      include: {
        dependencyTask: true,
      },
    },
  },
});

type TaskWithDependencies = Prisma.AgentTaskGetPayload<
  typeof taskWithDependencies
>;

export type CreateDatabaseAgentTaskInput = {
  runId: string;
  studentId: string;
  provider: string;
  input?: unknown;
  dependencies?: string[];
  courseWorldId?: string;
  dayId?: string;
  guildId?: string;
  requiredCapabilities?: string[];
  priority?: number;
  resourceClass?: AgentTaskResourceClass;
  maxAttempts?: number;
};

export type AgentTaskClaimInput = {
  lightCapacity: number;
  heavyCapacity: number;
  waitSeconds: number;
};

export type AgentTaskFailureInput = {
  leaseToken: string;
  kind: "infrastructure" | "business";
  error: string;
};

@Injectable()
export class AgentTaskService {
  private readonly providerBuckets = new Map<string, ProviderBucket>();

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AgentConnectorsService)
    private readonly connectors: AgentConnectorsService,
    @Optional() @Inject(AgentAvatarService)
    private readonly avatarService?: AgentAvatarService,
    @Optional() @Inject(AgentWorldService)
    private readonly agentWorld?: AgentWorldService,
    @Optional() @Inject(RealtimeGateway)
    private readonly realtimeGateway?: RealtimeGateway,
  ) {}

  async create(input: CreateDatabaseAgentTaskInput) {
    const existing = await this.prisma.agentTask.findFirst({
      where: { runId: input.runId },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException(`Agent run already exists: ${input.runId}`);
    }

    const dependencyRunIds = [...new Set(input.dependencies ?? [])];
    if (dependencyRunIds.includes(input.runId)) {
      throw new BadRequestException("An Agent run cannot depend on itself");
    }

    const dependencies = dependencyRunIds.length
      ? await this.prisma.agentTask.findMany({
          where: { runId: { in: dependencyRunIds } },
          select: { id: true, runId: true, status: true },
        })
      : [];
    const foundRunIds = new Set(dependencies.map((task) => task.runId));
    const missing = dependencyRunIds.filter((runId) => !foundRunIds.has(runId));
    if (missing.length) {
      throw new BadRequestException(
        `Agent run dependencies do not exist: ${missing.join(", ")}`,
      );
    }

    const incompleteDependencies = dependencies.filter(
      (task) => task.status !== AgentTaskStatus.completed,
    ).length;

    try {
      const created = await this.prisma.agentTask.create({
        data: {
          runId: input.runId,
          studentId: input.studentId,
          provider: input.provider,
          courseWorldId: input.courseWorldId,
          dayId: input.dayId,
          guildId: input.guildId,
          requiredCapabilities: (input.requiredCapabilities ?? []) as Prisma.InputJsonValue,
          priority: input.priority ?? 0,
          resourceClass: input.resourceClass ?? AgentTaskResourceClass.heavy,
          status:
            incompleteDependencies > 0
              ? AgentTaskStatus.blocked
              : AgentTaskStatus.queued,
          payload: this.toJsonInput(input.input ?? {}),
          blockedByCount: incompleteDependencies,
          maxAttempts: input.maxAttempts ?? 3,
          dependencies: {
            create: dependencies.map((dependency) => ({
              dependencyTaskId: dependency.id,
            })),
          },
        },
        ...taskWithDependencies,
      });
      return this.toTeacherRun(created);
    } catch (error) {
      if (this.isForeignKeyError(error)) {
        throw new BadRequestException(
          "studentId or task scope references a record that does not exist",
        );
      }
      throw error;
    }
  }

  async list() {
    const tasks = await this.prisma.agentTask.findMany({
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      ...taskWithDependencies,
    });
    return this.toRunViews(tasks);
  }

  async listForStudent(studentId: string) {
    const tasks = await this.prisma.agentTask.findMany({
      where: { studentId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      ...taskWithDependencies,
    });
    return this.toRunViews(tasks);
  }

  async get(runId: string) {
    const task = await this.prisma.agentTask.findFirst({
      where: { runId },
      ...taskWithDependencies,
    });
    if (!task) {
      throw new NotFoundException(`Agent run not found: ${runId}`);
    }
    return (await this.toRunViews([task]))[0];
  }

  async schedule() {
    await this.recoverExpiredLeases();
    await this.reconcileBlockedTasks();
    return { runs: await this.list() };
  }

  async pause(runId: string) {
    const task = await this.findTaskByRunId(runId);
    if (task.status !== AgentTaskStatus.queued) {
      throw new ConflictException(
        `Agent run ${runId} can only be paused while queued`,
      );
    }
    await this.prisma.agentTask.update({
      where: { id: task.id },
      data: {
        status: AgentTaskStatus.blocked,
        failureReason: PAUSED_BY_TEACHER,
      },
    });
    return this.get(runId);
  }

  async resume(runId: string) {
    const task = await this.findTaskByRunId(runId);
    if (
      task.status !== AgentTaskStatus.blocked ||
      task.failureReason !== PAUSED_BY_TEACHER
    ) {
      throw new ConflictException(`Agent run ${runId} is not teacher-paused`);
    }

    const blockerCount = await this.countIncompleteDependencies(task.id);
    await this.prisma.agentTask.update({
      where: { id: task.id },
      data: {
        status:
          blockerCount === 0
            ? AgentTaskStatus.queued
            : AgentTaskStatus.blocked,
        blockedByCount: blockerCount,
        failureReason: null,
      },
    });
    return this.get(runId);
  }

  async cancel(runId: string) {
    const task = await this.findTaskByRunId(runId);
    if (
      new Set<AgentTaskStatus>([
        AgentTaskStatus.completed,
        AgentTaskStatus.failed,
        AgentTaskStatus.cancelled,
      ]).has(task.status)
    ) {
      throw new ConflictException(
        `Agent run ${runId} cannot be cancelled from ${task.status}`,
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.agentTask.update({
        where: { id: task.id },
        data: {
          status: AgentTaskStatus.cancelled,
          completedAt: new Date(),
          leaseOwnerId: null,
          heavyLeaseKey: null,
          leaseTokenHash: null,
          leaseExpiresAt: null,
        },
      });
      await tx.agentTaskAttempt.updateMany({
        where: {
          taskId: task.id,
          status: {
            in: [
              AgentTaskAttemptStatus.leased,
              AgentTaskAttemptStatus.running,
            ],
          },
        },
        data: {
          status: AgentTaskAttemptStatus.cancelled,
          finishedAt: new Date(),
        },
      });
    });
    await this.markDependentsNeedsTeacher(
      task.id,
      `Dependency ${runId} was cancelled`,
    );
    await this.publishAvatarState(task.studentId);
    return this.get(runId);
  }

  async claim(connectorToken: string, input: AgentTaskClaimInput) {
    const connector = await this.connectors.authenticateConnectorToken(
      connectorToken,
    );
    const claimInput = this.clampClaimCapacity(connector, input);
    const deadline = Date.now() + claimInput.waitSeconds * 1_000;

    do {
      await this.recoverExpiredLeases();
      await this.reconcileBlockedTasks();
      const lease = await this.tryClaim(connector, claimInput);
      if (lease) {
        await this.prisma.$transaction([
          this.prisma.agentConnector.update({
            where: { id: connector.id },
            data: { status: "online", lastSeenAt: new Date() },
          }),
          this.prisma.agentSession.update({
            where: { id: connector.agentSessionId },
            data: { status: AgentSessionStatus.active },
          }),
        ]);
        await this.publishAvatarState(connector.studentId);
        return lease;
      }
      if (Date.now() >= deadline) break;
      await new Promise<void>((resolve) =>
        setTimeout(
          resolve,
          Math.min(
            CLAIM_POLL_INTERVAL_MS + Math.floor(Math.random() * CLAIM_POLL_JITTER_MS),
            Math.max(0, deadline - Date.now()),
          ),
        ),
      );
    } while (Date.now() <= deadline);

    return null;
  }

  async heartbeat(
    connectorToken: string,
    taskId: string,
    leaseToken: string,
  ) {
    const connector = await this.connectors.authenticateConnectorToken(
      connectorToken,
    );
    const lease = await this.findLease(connector.id, taskId, leaseToken);
    const now = new Date();
    const leaseExpiresAt = new Date(now.getTime() + LEASE_DURATION_MS);

    if (lease.task.leaseExpiresAt && lease.task.leaseExpiresAt <= now) {
      await this.recoverExpiredLeases();
      throw new ConflictException("Agent task lease has expired");
    }
    if (
      !new Set<AgentTaskStatus>([
        AgentTaskStatus.leased,
        AgentTaskStatus.running,
      ]).has(lease.task.status)
    ) {
      throw new ConflictException("Agent task lease is no longer active");
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.agentTask.updateMany({
        where: {
          id: taskId,
          leaseOwnerId: connector.id,
          leaseTokenHash: lease.leaseTokenHash,
          leaseExpiresAt: { gt: now },
          status: {
            in: [AgentTaskStatus.leased, AgentTaskStatus.running],
          },
        },
        data: {
          status: AgentTaskStatus.running,
          startedAt: lease.task.startedAt ?? now,
          leaseExpiresAt,
        },
      });
      if (result.count !== 1) {
        throw new ConflictException("Agent task lease changed concurrently");
      }
      await tx.agentTaskAttempt.update({
        where: { leaseTokenHash: lease.leaseTokenHash },
        data: {
          status: AgentTaskAttemptStatus.running,
          startedAt: lease.attempt.startedAt ?? now,
          leaseExpiresAt,
        },
      });
      await tx.agentSession.update({
        where: { id: connector.agentSessionId },
        data: { status: AgentSessionStatus.active },
      });
      return tx.agentTask.findUniqueOrThrow({ where: { id: taskId } });
    });

    await this.publishAvatarState(connector.studentId);

    return {
      taskId: updated.id,
      status: updated.status,
      leaseExpiresAt: leaseExpiresAt.toISOString(),
    };
  }

  async complete(
    connectorToken: string,
    taskId: string,
    leaseToken: string,
    result: unknown,
  ) {
    const connector = await this.connectors.authenticateConnectorToken(
      connectorToken,
    );
    const lease = await this.findLease(connector.id, taskId, leaseToken);
    if (lease.task.status === AgentTaskStatus.completed) {
      return this.toWorkerTask(lease.task);
    }

    const now = new Date();
    if (!lease.task.leaseExpiresAt || lease.task.leaseExpiresAt <= now) {
      await this.recoverExpiredLeases();
      throw new ConflictException("Agent task lease has expired");
    }

    const storedResult = this.toJsonInput(result);
    const completed = await this.prisma.$transaction(async (tx) => {
      const update = await tx.agentTask.updateMany({
        where: {
          id: taskId,
          leaseOwnerId: connector.id,
          leaseTokenHash: lease.leaseTokenHash,
          leaseExpiresAt: { gt: now },
          status: {
            in: [AgentTaskStatus.leased, AgentTaskStatus.running],
          },
        },
        data: {
          status: AgentTaskStatus.completed,
          result: storedResult,
          completedAt: now,
          heavyLeaseKey: null,
          failureReason: null,
        },
      });
      if (update.count !== 1) {
        throw new ConflictException("Agent task lease changed concurrently");
      }
      await tx.agentTaskAttempt.update({
        where: { leaseTokenHash: lease.leaseTokenHash },
        data: {
          status: AgentTaskAttemptStatus.completed,
          result: storedResult,
          finishedAt: now,
        },
      });
      await tx.agentSession.update({
        where: { id: connector.agentSessionId },
        data: { status: AgentSessionStatus.completed },
      });
      return tx.agentTask.findUniqueOrThrow({ where: { id: taskId } });
    });

    await this.reconcileDirectDependents(taskId);
    await this.publishAvatarState(connector.studentId);
    return this.toWorkerTask(completed);
  }

  async fail(
    connectorToken: string,
    taskId: string,
    input: AgentTaskFailureInput,
  ) {
    const connector = await this.connectors.authenticateConnectorToken(
      connectorToken,
    );
    const lease = await this.findLease(connector.id, taskId, input.leaseToken);
    if (lease.attempt.status === AgentTaskAttemptStatus.failed) {
      return this.toWorkerTask(lease.task);
    }
    if (
      !new Set<AgentTaskStatus>([
        AgentTaskStatus.leased,
        AgentTaskStatus.running,
      ]).has(lease.task.status)
    ) {
      throw new ConflictException("Agent task lease is no longer active");
    }

    const now = new Date();
    const retry =
      input.kind === "infrastructure" &&
      lease.task.attemptCount < lease.task.maxAttempts;
    const nextStatus = retry
      ? AgentTaskStatus.queued
      : input.kind === "infrastructure"
        ? AgentTaskStatus.needs_teacher
        : AgentTaskStatus.failed;

    const failed = await this.prisma.$transaction(async (tx) => {
      const update = await tx.agentTask.updateMany({
        where: {
          id: taskId,
          leaseOwnerId: connector.id,
          leaseTokenHash: lease.leaseTokenHash,
          status: {
            in: [AgentTaskStatus.leased, AgentTaskStatus.running],
          },
        },
        data: {
          status: nextStatus,
          availableAt: retry
            ? new Date(now.getTime() + this.retryDelayMs(lease.task.attemptCount))
            : lease.task.availableAt,
          failureReason: `${input.kind}: ${input.error}`,
          failedAt: retry ? null : now,
          heavyLeaseKey: null,
          leaseOwnerId: retry ? null : lease.task.leaseOwnerId,
          leaseTokenHash: retry ? null : lease.task.leaseTokenHash,
          leaseExpiresAt: retry ? null : lease.task.leaseExpiresAt,
        },
      });
      if (update.count !== 1) {
        throw new ConflictException("Agent task lease changed concurrently");
      }
      await tx.agentTaskAttempt.update({
        where: { leaseTokenHash: lease.leaseTokenHash },
        data: {
          status: AgentTaskAttemptStatus.failed,
          errorKind: input.kind,
          errorMessage: input.error,
          finishedAt: now,
        },
      });
      if (!retry) {
        await tx.agentSession.update({
          where: { id: connector.agentSessionId },
          data: { status: AgentSessionStatus.failed },
        });
      }
      return tx.agentTask.findUniqueOrThrow({ where: { id: taskId } });
    });

    if (!retry) {
      await this.markDependentsNeedsTeacher(
        taskId,
        `Dependency ${lease.task.runId} did not complete`,
      );
    }
    await this.publishAvatarState(connector.studentId);
    return this.toWorkerTask(failed);
  }

  private async tryClaim(
    connector: {
      id: string;
      studentId: string;
      provider: string;
      clientName: string;
      capabilities: Prisma.JsonValue;
    },
    input: AgentTaskClaimInput,
  ) {
    const allowedResources: AgentTaskResourceClass[] = [];
    const activeLight = await this.prisma.agentTask.count({
      where: {
        leaseOwnerId: connector.id,
        resourceClass: AgentTaskResourceClass.light,
        status: { in: [AgentTaskStatus.leased, AgentTaskStatus.running] },
      },
    });
    const activeHeavyForStudent = await this.prisma.agentTask.count({
      where: {
        studentId: connector.studentId,
        resourceClass: AgentTaskResourceClass.heavy,
        status: { in: [AgentTaskStatus.leased, AgentTaskStatus.running] },
      },
    });
    if (input.lightCapacity > activeLight) {
      allowedResources.push(AgentTaskResourceClass.light);
    }
    if (input.heavyCapacity > 0 && activeHeavyForStudent === 0) {
      allowedResources.push(AgentTaskResourceClass.heavy);
    }
    if (!allowedResources.length) return null;

    const connectorCapabilities = new Set(
      this.toStringArray(connector.capabilities),
    );
    const candidates = await this.prisma.agentTask.findMany({
      where: {
        studentId: connector.studentId,
        provider: connector.provider,
        status: AgentTaskStatus.queued,
        blockedByCount: 0,
        resourceClass: { in: allowedResources },
        availableAt: { lte: new Date() },
        leaseOwnerId: null,
        leaseTokenHash: null,
      },
      orderBy: [
        { priority: "desc" },
        { availableAt: "asc" },
        { createdAt: "asc" },
      ],
      take: 50,
    });
    const rankedAt = Date.now();
    candidates.sort((left, right) => {
      const leftScore =
        left.priority +
        Math.floor((rankedAt - left.createdAt.getTime()) / AGING_INTERVAL_MS);
      const rightScore =
        right.priority +
        Math.floor((rankedAt - right.createdAt.getTime()) / AGING_INTERVAL_MS);
      return (
        rightScore - leftScore ||
        left.availableAt.getTime() - right.availableAt.getTime() ||
        left.createdAt.getTime() - right.createdAt.getTime()
      );
    });

    for (const candidate of candidates) {
      const required = this.toStringArray(candidate.requiredCapabilities);
      if (!required.every((capability) => connectorCapabilities.has(capability))) {
        continue;
      }
      if (!this.reserveProviderQuota(candidate.provider, candidate.payload)) {
        return null;
      }

      const leaseToken = `tasklease_${crypto.randomBytes(32).toString("hex")}`;
      const leaseTokenHash = this.hashSecret(leaseToken);
      const now = new Date();
      const leaseExpiresAt = new Date(now.getTime() + LEASE_DURATION_MS);
      try {
        const claimed = await this.prisma.$transaction(async (tx) => {
          if (candidate.resourceClass === AgentTaskResourceClass.heavy) {
            const activeHeavy = await tx.agentTask.count({
              where: {
                studentId: connector.studentId,
                resourceClass: AgentTaskResourceClass.heavy,
                status: {
                  in: [AgentTaskStatus.leased, AgentTaskStatus.running],
                },
              },
            });
            if (activeHeavy > 0) return null;
          } else {
            const activeLightTasks = await tx.agentTask.count({
              where: {
                leaseOwnerId: connector.id,
                resourceClass: AgentTaskResourceClass.light,
                status: {
                  in: [AgentTaskStatus.leased, AgentTaskStatus.running],
                },
              },
            });
            if (activeLightTasks >= input.lightCapacity) return null;
          }
          const update = await tx.agentTask.updateMany({
            where: {
              id: candidate.id,
              status: AgentTaskStatus.queued,
              attemptCount: candidate.attemptCount,
              availableAt: { lte: now },
              leaseOwnerId: null,
              leaseTokenHash: null,
            },
            data: {
              status: AgentTaskStatus.leased,
              leaseOwnerId: connector.id,
              heavyLeaseKey:
                candidate.resourceClass === AgentTaskResourceClass.heavy
                  ? `heavy:${connector.studentId}`
                  : null,
              leaseTokenHash,
              leasedAt: now,
              leaseExpiresAt,
              attemptCount: { increment: 1 },
            },
          });
          if (update.count !== 1) return null;

          await tx.agentTaskAttempt.create({
            data: {
              taskId: candidate.id,
              connectorId: connector.id,
              attemptNumber: candidate.attemptCount + 1,
              status: AgentTaskAttemptStatus.leased,
              leaseTokenHash,
              leasedAt: now,
              leaseExpiresAt,
            },
          });
          return tx.agentTask.findUniqueOrThrow({
            where: { id: candidate.id },
          });
        }, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          maxWait: 5_000,
          timeout: 5_000,
        });
        if (!claimed) continue;

        return {
          task: this.toWorkerTask(claimed),
          leaseToken,
          leaseExpiresAt: leaseExpiresAt.toISOString(),
          heartbeatIntervalSeconds: HEARTBEAT_INTERVAL_SECONDS,
        };
      } catch (error) {
        if (this.isConcurrentClaimError(error)) continue;
        throw error;
      }
    }
    return null;
  }

  private async findLease(
    connectorId: string,
    taskId: string,
    leaseToken: string,
  ) {
    if (!leaseToken) {
      throw new UnauthorizedException("Agent task lease token is required");
    }
    const leaseTokenHash = this.hashSecret(leaseToken);
    const attempt = await this.prisma.agentTaskAttempt.findUnique({
      where: { leaseTokenHash },
      include: { task: true },
    });
    if (
      !attempt ||
      attempt.taskId !== taskId ||
      attempt.connectorId !== connectorId
    ) {
      throw new UnauthorizedException("Invalid Agent task lease token");
    }
    return { attempt, task: attempt.task, leaseTokenHash };
  }

  private async recoverExpiredLeases() {
    const now = new Date();
    const expired = await this.prisma.agentTask.findMany({
      where: {
        status: { in: [AgentTaskStatus.leased, AgentTaskStatus.running] },
        leaseExpiresAt: { lte: now },
        leaseTokenHash: { not: null },
      },
      take: 100,
    });

    for (const task of expired) {
      const canRetry = task.attemptCount < task.maxAttempts;
      const nextStatus = canRetry
        ? AgentTaskStatus.queued
        : AgentTaskStatus.needs_teacher;
      const tokenHash = task.leaseTokenHash as string;
      const updated = await this.prisma.$transaction(async (tx) => {
        const update = await tx.agentTask.updateMany({
          where: {
            id: task.id,
            status: task.status,
            leaseTokenHash: tokenHash,
            leaseExpiresAt: { lte: now },
          },
          data: {
            status: nextStatus,
            availableAt: canRetry
              ? new Date(now.getTime() + this.retryDelayMs(task.attemptCount))
              : task.availableAt,
            failureReason: "infrastructure: task lease expired",
            failedAt: canRetry ? null : now,
            leaseOwnerId: null,
            heavyLeaseKey: null,
            leaseTokenHash: null,
            leaseExpiresAt: null,
          },
        });
        if (update.count !== 1) return false;
        await tx.agentTaskAttempt.updateMany({
          where: {
            taskId: task.id,
            leaseTokenHash: tokenHash,
            status: {
              in: [
                AgentTaskAttemptStatus.leased,
                AgentTaskAttemptStatus.running,
              ],
            },
          },
          data: {
            status: AgentTaskAttemptStatus.expired,
            errorKind: "infrastructure",
            errorMessage: "task lease expired",
            finishedAt: now,
          },
        });
        return true;
      });
      if (updated && !canRetry) {
        await this.markDependentsNeedsTeacher(
          task.id,
          `Dependency ${task.runId} exhausted its attempts`,
        );
      }
      if (updated) await this.publishAvatarState(task.studentId);
    }
  }

  private async publishAvatarState(studentId: string) {
    try {
      this.avatarService?.invalidateCache();
      const state = await this.avatarService?.getAvatarState(studentId);
      if (!state) return;

      let movement: Awaited<ReturnType<AgentWorldService["resetToRoleHome"]>>;
      if (
        (state.status === "working" || state.status === "reviewing") &&
        state.agentRole &&
        this.agentWorld
      ) {
        movement = await this.agentWorld.resetToRoleHome(
          studentId,
          state.agentRole,
        );
      }

      this.realtimeGateway?.broadcastAgentStatus({
        studentId: state.studentId,
        displayName: state.displayName,
        status: state.status,
        currentZone: state.currentZone,
        activitySummary: state.activitySummary,
      });
      if (movement) this.realtimeGateway?.broadcastAvatarMovement(movement);
    } catch {
      // Realtime presentation must never roll back a committed Agent task.
    }
  }

  private async reconcileBlockedTasks() {
    const tasks = await this.prisma.agentTask.findMany({
      where: {
        status: AgentTaskStatus.blocked,
        NOT: { failureReason: PAUSED_BY_TEACHER },
      },
      select: { id: true },
      take: 200,
    });
    for (const task of tasks) {
      await this.reconcileTask(task.id);
    }
  }

  private async reconcileDirectDependents(taskId: string) {
    const dependents = await this.prisma.agentTaskDependency.findMany({
      where: { dependencyTaskId: taskId },
      select: { taskId: true },
    });
    for (const dependent of dependents) {
      await this.reconcileTask(dependent.taskId);
    }
  }

  private async reconcileTask(taskId: string) {
    const task = await this.prisma.agentTask.findUnique({
      where: { id: taskId },
      include: {
        dependencies: {
          include: {
            dependencyTask: { select: { runId: true, status: true } },
          },
        },
      },
    });
    if (
      !task ||
      task.status !== AgentTaskStatus.blocked ||
      task.failureReason === PAUSED_BY_TEACHER
    ) {
      return;
    }

    const terminalBlocker = task.dependencies.find((dependency) =>
      new Set<AgentTaskStatus>([
        AgentTaskStatus.failed,
        AgentTaskStatus.needs_teacher,
        AgentTaskStatus.cancelled,
      ]).has(dependency.dependencyTask.status),
    );
    if (terminalBlocker) {
      await this.prisma.agentTask.updateMany({
        where: { id: task.id, status: AgentTaskStatus.blocked },
        data: {
          status: AgentTaskStatus.needs_teacher,
          failureReason: `Dependency ${terminalBlocker.dependencyTask.runId} did not complete`,
        },
      });
      return;
    }

    const blockerCount = task.dependencies.filter(
      (dependency) =>
        dependency.dependencyTask.status !== AgentTaskStatus.completed,
    ).length;
    await this.prisma.agentTask.updateMany({
      where: { id: task.id, status: AgentTaskStatus.blocked },
      data: {
        blockedByCount: blockerCount,
        status:
          blockerCount === 0
            ? AgentTaskStatus.queued
            : AgentTaskStatus.blocked,
      },
    });
  }

  private async markDependentsNeedsTeacher(taskId: string, reason: string) {
    const dependents = await this.prisma.agentTaskDependency.findMany({
      where: { dependencyTaskId: taskId },
      select: { taskId: true },
    });
    if (!dependents.length) return;
    await this.prisma.agentTask.updateMany({
      where: {
        id: { in: dependents.map((dependent) => dependent.taskId) },
        status: { in: [AgentTaskStatus.blocked, AgentTaskStatus.queued] },
      },
      data: {
        status: AgentTaskStatus.needs_teacher,
        failureReason: reason,
      },
    });
  }

  private countIncompleteDependencies(taskId: string) {
    return this.prisma.agentTaskDependency.count({
      where: {
        taskId,
        dependencyTask: { status: { not: AgentTaskStatus.completed } },
      },
    });
  }

  private async findTaskByRunId(runId: string) {
    const task = await this.prisma.agentTask.findFirst({ where: { runId } });
    if (!task) {
      throw new NotFoundException(`Agent run not found: ${runId}`);
    }
    return task;
  }

  private toTeacherRun(task: TaskWithDependencies) {
    return {
      id: task.id,
      runId: task.runId,
      courseWorldId: task.courseWorldId,
      dayId: task.dayId,
      guildId: task.guildId,
      input: task.payload,
      dependencies: task.dependencies.map(
        (dependency) => dependency.dependencyTask.runId,
      ),
      status: task.status,
      studentId: task.studentId,
      provider: task.provider,
      requiredCapabilities: this.toStringArray(task.requiredCapabilities),
      priority: task.priority,
      resourceClass: task.resourceClass,
      attemptCount: task.attemptCount,
      maxAttempts: task.maxAttempts,
      blockedByCount: task.blockedByCount,
      failureReason: task.failureReason,
      result: task.result,
      submission: null,
      createdAt: task.createdAt.toISOString(),
      updatedAt: task.updatedAt.toISOString(),
    };
  }

  private async toRunViews(tasks: TaskWithDependencies[]) {
    if (!tasks.length) return [];

    const submissions = await this.prisma.agentSubmission.findMany({
      where: {
        clientRequestId: {
          in: tasks.map((task) => this.submissionClientRequestId(task.id)),
        },
      },
      select: {
        id: true,
        studentId: true,
        clientRequestId: true,
        reviewResult: {
          select: { status: true, decision: true },
        },
      },
    });
    const submissionsByTask = new Map(
      submissions.map((submission) => [
        `${submission.studentId}:${submission.clientRequestId}`,
        submission,
      ]),
    );

    return tasks.map((task) => {
      const submission = submissionsByTask.get(
        `${task.studentId}:${this.submissionClientRequestId(task.id)}`,
      );
      return {
        ...this.toTeacherRun(task),
        submission: submission?.reviewResult
          ? {
              id: submission.id,
              reviewStatus: submission.reviewResult.status,
              decision: submission.reviewResult.decision,
            }
          : null,
      };
    });
  }

  private submissionClientRequestId(taskId: string) {
    return `agent-task:${taskId}`;
  }

  private toWorkerTask(task: {
    id: string;
    runId: string;
    courseWorldId: string | null;
    dayId: string | null;
    guildId: string | null;
    studentId: string;
    provider: string;
    requiredCapabilities: Prisma.JsonValue;
    priority: number;
    resourceClass: AgentTaskResourceClass;
    status: AgentTaskStatus;
    payload: Prisma.JsonValue;
    attemptCount: number;
    maxAttempts: number;
    createdAt: Date;
  }) {
    return {
      id: task.id,
      runId: task.runId,
      scope: {
        courseWorldId: task.courseWorldId,
        dayId: task.dayId,
        guildId: task.guildId,
        studentId: task.studentId,
      },
      provider: task.provider,
      requiredCapabilities: this.toStringArray(task.requiredCapabilities),
      priority: task.priority,
      resourceClass: task.resourceClass,
      status: task.status,
      payload: task.payload,
      attemptCount: task.attemptCount,
      maxAttempts: task.maxAttempts,
      createdAt: task.createdAt.toISOString(),
    };
  }

  private toStringArray(value: Prisma.JsonValue) {
    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === "string")
      : [];
  }

  private clampClaimCapacity(
    connector: { id: string; studentId: string; clientName: string },
    input: AgentTaskClaimInput,
  ): AgentTaskClaimInput {
    const allowlist = new Set(
      (process.env.AGENT_TASK_LIGHT_CAPACITY_ALLOWLIST ?? "")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean),
    );
    const isAllowlisted =
      allowlist.has("*") ||
      allowlist.has(connector.id) ||
      allowlist.has(connector.studentId) ||
      allowlist.has(connector.clientName);
    const configuredMaximum = Number(
      process.env.AGENT_TASK_MAX_LIGHT_CAPACITY ?? "8",
    );
    const maximumLightCapacity = isAllowlisted
      ? Number.isInteger(configuredMaximum)
        ? Math.min(8, Math.max(1, configuredMaximum))
        : 8
      : 1;

    return {
      lightCapacity: Math.min(
        maximumLightCapacity,
        Math.max(0, input.lightCapacity ?? 1),
      ),
      heavyCapacity: Math.min(1, Math.max(0, input.heavyCapacity ?? 1)),
      waitSeconds: Math.min(25, Math.max(0, input.waitSeconds ?? 25)),
    };
  }

  private toJsonInput(value: unknown) {
    return (value === null ? Prisma.JsonNull : value) as Prisma.InputJsonValue;
  }

  private retryDelayMs(attemptCount: number) {
    return Math.min(1_000 * 2 ** Math.max(0, attemptCount - 1), 30_000);
  }

  /**
   * Optional single-API token bucket. Configure only for centrally shared
   * provider accounts; student-owned provider accounts can leave it disabled.
   */
  private reserveProviderQuota(provider: string, payload: Prisma.JsonValue) {
    const limit = this.getProviderRateLimit(provider);
    if (!limit) return true;

    const now = Date.now();
    const current = this.providerBuckets.get(provider) ?? {
      requestTokens: limit.rpm,
      modelTokens: limit.tpm,
      updatedAt: now,
    };
    const elapsedMinutes = Math.max(0, now - current.updatedAt) / 60_000;
    current.requestTokens = Math.min(
      limit.rpm,
      current.requestTokens + elapsedMinutes * limit.rpm,
    );
    current.modelTokens = Math.min(
      limit.tpm,
      current.modelTokens + elapsedMinutes * limit.tpm,
    );
    current.updatedAt = now;

    const estimatedTokens = this.estimateTaskTokens(payload);
    if (current.requestTokens < 1 || current.modelTokens < estimatedTokens) {
      this.providerBuckets.set(provider, current);
      return false;
    }
    current.requestTokens -= 1;
    current.modelTokens -= estimatedTokens;
    this.providerBuckets.set(provider, current);
    return true;
  }

  private getProviderRateLimit(provider: string): ProviderRateLimit | null {
    const raw = process.env.AGENT_PROVIDER_RATE_LIMITS?.trim();
    if (!raw) return null;
    try {
      const config = JSON.parse(raw) as Record<
        string,
        { rpm?: unknown; tpm?: unknown }
      >;
      const entry = config[provider];
      const rpm = Number(entry?.rpm);
      const tpm = Number(entry?.tpm);
      if (!Number.isFinite(rpm) || rpm <= 0 || !Number.isFinite(tpm) || tpm <= 0) {
        return null;
      }
      return { rpm, tpm };
    } catch {
      return null;
    }
  }

  private estimateTaskTokens(payload: Prisma.JsonValue) {
    if (
      payload &&
      typeof payload === "object" &&
      !Array.isArray(payload) &&
      typeof payload.estimatedTokens === "number" &&
      Number.isFinite(payload.estimatedTokens)
    ) {
      return Math.max(1, Math.ceil(payload.estimatedTokens));
    }
    return Math.max(1, Math.ceil(JSON.stringify(payload).length / 4));
  }

  private hashSecret(value: string) {
    return crypto.createHash("sha256").update(value).digest("hex");
  }

  private isForeignKeyError(error: unknown) {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003";
  }

  private isConcurrentClaimError(error: unknown) {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      ["P1008", "P2002", "P2028", "P2034"].includes(error.code)
    );
  }
}
