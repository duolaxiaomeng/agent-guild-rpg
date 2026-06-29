import { Inject, Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";

@Injectable()
export class RoomsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

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
