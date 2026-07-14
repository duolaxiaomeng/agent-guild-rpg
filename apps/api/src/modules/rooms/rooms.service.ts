import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";

@Injectable()
export class RoomsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /**
   * Provision the short-lived room grant used by a classroom helper after a
   * help request is claimed. ClassroomService has already checked that the
   * requester is the teacher or an assigned assistant; keeping the write here
   * means room access still follows the same grant representation consumed by
   * ChatService and the rooms endpoints.
   */
  async createSupportGrant(
    roomId: string,
    granteeId: string,
    requesterRole: UserRole,
    expiresInHours = 2
  ) {
    if (requesterRole !== UserRole.teacher && requesterRole !== UserRole.student) {
      throw new ForbiddenException("Classroom staff access required");
    }
    if (!roomId.startsWith("room-chat-") || roomId.length <= "room-chat-".length) {
      throw new BadRequestException(`Invalid room ID: ${roomId}`);
    }

    const grantee = await this.prisma.user.findUnique({
      where: { id: granteeId },
      select: { id: true }
    });
    if (!grantee) {
      throw new BadRequestException(`被授权用户不存在: ${granteeId}`);
    }

    const existing = await this.prisma.roomAccessGrant.findFirst({
      where: {
        roomId,
        granteeId,
        scope: "classroom_help",
        status: "approved",
        expiresAt: { gt: new Date() }
      },
      orderBy: { createdAt: "desc" }
    });
    if (existing) return this.enrichGrant(existing);

    const grant = await this.prisma.roomAccessGrant.create({
      data: {
        roomId,
        granteeId,
        scope: "classroom_help",
        status: "approved",
        expiresAt: new Date(Date.now() + expiresInHours * 60 * 60 * 1000)
      }
    });
    return this.enrichGrant(grant);
  }

  async createGrant(
    roomId: string,
    user: { id: string; role: UserRole; displayName: string },
    granteeId: string,
    scope: string,
    expiresInHours: number
  ) {
    this.assertRoomOwner(roomId, user);

    const grantee = await this.prisma.user.findUnique({
      where: { id: granteeId },
      select: { id: true }
    });
    if (!grantee) {
      throw new BadRequestException(`被授权用户不存在: ${granteeId}`);
    }

    const grant = await this.prisma.roomAccessGrant.create({
      data: {
        roomId,
        granteeId,
        scope,
        status: "approved",
        expiresAt: new Date(Date.now() + expiresInHours * 60 * 60 * 1000)
      }
    });

    return this.enrichGrant(grant);
  }

  async listGrants(
    roomId: string,
    user: { id: string; role: UserRole; displayName: string }
  ) {
    this.assertRoomOwner(roomId, user);

    const grants = await this.prisma.roomAccessGrant.findMany({
      where: { roomId },
      orderBy: { createdAt: "desc" }
    });

    return this.enrichGrants(grants);
  }

  async revokeGrant(
    grantId: string,
    user: { id: string; role: UserRole; displayName: string }
  ) {
    const existingGrant = await this.prisma.roomAccessGrant.findUnique({
      where: { id: grantId }
    });
    if (!existingGrant) {
      throw new NotFoundException(`授权记录不存在: ${grantId}`);
    }
    if (existingGrant.status === "revoked") {
      throw new ConflictException("该授权已被撤销，无法重复操作");
    }
    this.assertRoomOwner(existingGrant.roomId, user);

    const grant = await this.prisma.roomAccessGrant.update({
      where: { id: grantId },
      data: { status: "revoked" }
    });

    return this.enrichGrant(grant);
  }

  private async enrichGrant(grant: {
    id: string;
    roomId: string;
    granteeId: string;
    scope: string;
    status: string;
    expiresAt: Date;
    createdAt: Date;
  }) {
    const users = await this.prisma.user.findMany({
      where: {
        id: {
          in: [grant.granteeId]
        }
      },
      select: {
        id: true,
        displayName: true
      }
    });
    const nameById = new Map(users.map((user) => [user.id, user.displayName]));

    return {
      ...grant,
      granteeName: nameById.get(grant.granteeId) ?? grant.granteeId
    };
  }

  private async enrichGrants(
    grants: Array<{
      id: string;
      roomId: string;
      granteeId: string;
      scope: string;
      status: string;
      expiresAt: Date;
      createdAt: Date;
    }>
  ) {
    const users = await this.prisma.user.findMany({
      where: {
        id: {
          in: [...new Set(grants.map((grant) => grant.granteeId))]
        }
      },
      select: {
        id: true,
        displayName: true
      }
    });
    const nameById = new Map(users.map((user) => [user.id, user.displayName]));

    return grants.map((grant) => ({
      ...grant,
      granteeName: nameById.get(grant.granteeId) ?? grant.granteeId
    }));
  }

  async listAccessibleRooms(
    user: { id: string; role: UserRole; displayName: string }
  ) {
    if (user.role !== UserRole.student) {
      throw new ForbiddenException("Student access required");
    }

    const grants = await this.prisma.roomAccessGrant.findMany({
      where: {
        granteeId: user.id,
        status: "approved",
        expiresAt: { gt: new Date() }
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }]
    });

    const validGrants = grants.filter((grant) => {
      try {
        this.getRoomOwnerId(grant.roomId);
        return true;
      } catch {
        return false;
      }
    });

    const ownerIds = [
      ...new Set(validGrants.map((grant) => this.getRoomOwnerId(grant.roomId)))
    ];
    const users = await this.prisma.user.findMany({
      where: { id: { in: ownerIds } },
      select: { id: true, displayName: true }
    });
    const nameById = new Map(users.map((u) => [u.id, u.displayName]));

    return validGrants.map((grant) => {
      const ownerId = this.getRoomOwnerId(grant.roomId);
      return {
        roomId: grant.roomId,
        ownerId,
        ownerName: nameById.get(ownerId) ?? ownerId,
        scope: grant.scope,
        expiresAt: grant.expiresAt,
        createdAt: grant.createdAt
      };
    });
  }

  private assertRoomOwner(
    roomId: string,
    user: { id: string; role: UserRole; displayName: string }
  ) {
    if (user.role === UserRole.teacher) {
      return;
    }

    if (user.role !== UserRole.student) {
      throw new ForbiddenException("Room owner access required");
    }

    if (this.getRoomOwnerId(roomId) !== user.id) {
      throw new ForbiddenException("Cannot manage another student's room");
    }
  }

  private getRoomOwnerId(roomId: string) {
    if (!roomId.startsWith("room-chat-")) {
      throw new BadRequestException(`Invalid room ID format: ${roomId}`);
    }

    const ownerId = roomId.replace("room-chat-", "");

    if (!ownerId) {
      throw new BadRequestException("Empty owner ID in room ID");
    }

    return ownerId;
  }
}
