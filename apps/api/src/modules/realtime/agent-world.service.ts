import { Inject, Injectable } from "@nestjs/common";
import { AgentTaskStatus, UserRole } from "@prisma/client";
import {
  WORKSTATION_HOME_BY_VISUAL_ROLE,
  avatarMoveCommandSchema,
  isWorkstationTargetWalkable,
  type AgentWorldPosition,
  type AvatarMoveAck,
  type AvatarMoveCommand,
  type AvatarMovement,
  type AvatarMovementLockReason,
  type WorkstationFacing,
} from "contracts";
import { PrismaService } from "../../prisma/prisma.service";
import { resolveAgentVisualRole } from "../agent-team/agent-team.mapping";

type StoredWorldState = {
  studentId: string;
  currentZone: string;
  positionX: number;
  positionY: number;
  facing: string;
  revision: number;
  updatedAt: Date;
};

@Injectable()
export class AgentWorldService {
  private readonly movementQueues = new Map<string, Promise<void>>();

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async getPosition(
    studentId: string,
    roleKey?: string | null,
  ): Promise<AgentWorldPosition | undefined> {
    const home = this.resolveHome(roleKey);
    if (!home) return undefined;

    const state = await this.prisma.agentWorldState.upsert({
      where: { studentId },
      create: {
        studentId,
        currentZone: "workstations",
        positionX: home.x,
        positionY: home.y,
        facing: home.facing,
      },
      update: {},
    });
    return this.toPosition(state);
  }

  async getMovementLock(
    studentId: string,
  ): Promise<AvatarMovementLockReason | null> {
    const [activeTask, pendingReview] = await Promise.all([
      this.prisma.agentTask.findFirst({
        where: {
          studentId,
          status: { in: [AgentTaskStatus.leased, AgentTaskStatus.running] },
        },
        select: { id: true },
      }),
      this.prisma.reviewResult.findFirst({
        where: {
          submission: { studentId },
          status: { in: ["queued", "ai_reviewed"] },
        },
        select: { id: true },
      }),
    ]);

    if (activeTask) return "task_running";
    if (pendingReview) return "reviewing";
    return null;
  }

  async moveAvatar(
    studentId: string | undefined,
    input: AvatarMoveCommand,
  ): Promise<AvatarMoveAck> {
    if (!studentId) {
      return { accepted: false, reason: "authentication_required" };
    }

    // Socket.IO handlers may overlap while a student clicks repeatedly. Keep
    // writes ordered per student so the newest received command always owns the
    // highest revision and therefore cancels older routes on every connection.
    const previous = this.movementQueues.get(studentId) ?? Promise.resolve();
    const execution = previous
      .catch(() => undefined)
      .then(() => this.moveAvatarUnlocked(studentId, input));
    const tail = execution.then(() => undefined, () => undefined);
    this.movementQueues.set(studentId, tail);
    try {
      return await execution;
    } finally {
      if (this.movementQueues.get(studentId) === tail) {
        this.movementQueues.delete(studentId);
      }
    }
  }

  private async moveAvatarUnlocked(
    studentId: string,
    input: AvatarMoveCommand,
  ): Promise<AvatarMoveAck> {

    const parsed = avatarMoveCommandSchema.safeParse(input);
    if (!parsed.success) {
      return { accepted: false, reason: "invalid_target" };
    }

    const user = await this.prisma.user.findUnique({
      where: { id: studentId },
      select: {
        role: true,
        agentTeamBinding: { select: { roleKey: true } },
      },
    });
    if (!user || user.role !== UserRole.student) {
      return { accepted: false, reason: "student_only" };
    }

    const home = this.resolveHome(user.agentTeamBinding?.roleKey);
    if (!home) {
      return { accepted: false, reason: "role_required" };
    }

    const movementLock = await this.getMovementLock(studentId);
    if (movementLock) {
      return { accepted: false, reason: "movement_locked" };
    }

    const { targetX, targetY, commandId } = parsed.data;
    if (!isWorkstationTargetWalkable(targetX, targetY)) {
      return { accepted: false, reason: "invalid_target" };
    }

    const current = await this.prisma.agentWorldState.findUnique({
      where: { studentId },
    });
    const fromX = current?.positionX ?? home.x;
    const fromY = current?.positionY ?? home.y;
    const facing = this.resolveFacing(fromX, fromY, targetX, targetY);
    const state = await this.prisma.agentWorldState.upsert({
      where: { studentId },
      create: {
        studentId,
        currentZone: "workstations",
        positionX: targetX,
        positionY: targetY,
        facing,
        revision: 1,
      },
      update: {
        currentZone: "workstations",
        positionX: targetX,
        positionY: targetY,
        facing,
        revision: { increment: 1 },
      },
    });

    return {
      accepted: true,
      movement: this.toMovement(state, commandId, "manual"),
    };
  }

  async resetToRoleHome(
    studentId: string,
    roleKey: string,
    commandId = `system-home-${Date.now()}`,
  ): Promise<AvatarMovement | undefined> {
    const home = this.resolveHome(roleKey);
    if (!home) return undefined;

    const current = await this.prisma.agentWorldState.findUnique({
      where: { studentId },
    });
    if (
      current?.currentZone === "workstations" &&
      current.positionX === home.x &&
      current.positionY === home.y &&
      current.facing === home.facing
    ) {
      return undefined;
    }

    const state = await this.prisma.agentWorldState.upsert({
      where: { studentId },
      create: {
        studentId,
        currentZone: "workstations",
        positionX: home.x,
        positionY: home.y,
        facing: home.facing,
        revision: 0,
      },
      update: {
        currentZone: "workstations",
        positionX: home.x,
        positionY: home.y,
        facing: home.facing,
        revision: { increment: 1 },
      },
    });
    return this.toMovement(state, commandId, "system");
  }

  private resolveHome(roleKey?: string | null) {
    const visualRole = roleKey ? resolveAgentVisualRole(roleKey) : null;
    return visualRole ? WORKSTATION_HOME_BY_VISUAL_ROLE[visualRole] : undefined;
  }

  private resolveFacing(
    fromX: number,
    fromY: number,
    targetX: number,
    targetY: number,
  ): WorkstationFacing {
    const dx = targetX - fromX;
    const dy = targetY - fromY;
    if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? "right" : "left";
    return dy >= 0 ? "down" : "up";
  }

  private toPosition(state: StoredWorldState): AgentWorldPosition {
    return {
      zone: "workstations",
      x: state.positionX,
      y: state.positionY,
      facing: state.facing as WorkstationFacing,
      revision: state.revision,
      updatedAt: state.updatedAt.toISOString(),
    };
  }

  private toMovement(
    state: StoredWorldState,
    commandId: string,
    source: "manual" | "system",
  ): AvatarMovement {
    return {
      commandId,
      studentId: state.studentId,
      zone: "workstations",
      targetX: state.positionX,
      targetY: state.positionY,
      facing: state.facing as WorkstationFacing,
      revision: state.revision,
      source,
      updatedAt: state.updatedAt.toISOString(),
    };
  }
}
