import { Inject, Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";

@Injectable()
export class RoomsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  createGrant(
    roomId: string,
    granteeId: string,
    scope: string,
    expiresInHours: number
  ) {
    return this.prisma.roomAccessGrant.create({
      data: {
        roomId,
        granteeId,
        scope,
        status: "approved",
        expiresAt: new Date(Date.now() + expiresInHours * 60 * 60 * 1000)
      }
    });
  }

  listGrants(roomId: string) {
    return this.prisma.roomAccessGrant.findMany({
      where: { roomId },
      orderBy: { createdAt: "desc" }
    });
  }
}
