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
    granteeId: string,
    scope: string,
    expiresInHours: number
  ) {
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

  async listGrants(roomId: string) {
    const grants = await this.prisma.roomAccessGrant.findMany({
      where: { roomId },
      orderBy: { createdAt: "desc" }
    });

    return this.enrichGrants(grants);
  }

  async revokeGrant(grantId: string) {
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
}
