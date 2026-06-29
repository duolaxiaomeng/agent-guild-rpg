import { Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";

@Injectable()
export class AuthService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async login(email: string, password: string) {
    const user = await this.prisma.user.findUnique({
      where: { email }
    });

    if (!user || user.passwordHash !== password) {
      throw new UnauthorizedException("Invalid credentials");
    }

    const session = await this.prisma.userSession.create({
      data: {
        userId: user.id,
        token: `session_${user.id}_${Date.now()}`,
        expiresAt: new Date(Date.now() + 8 * 60 * 60 * 1000)
      }
    });

    return {
      token: session.token,
      user: {
        id: user.id,
        role: user.role,
        displayName: user.displayName
      }
    };
  }

  async getSession(token: string) {
    if (!token) {
      throw new UnauthorizedException("Invalid session");
    }

    const session = await this.prisma.userSession.findUnique({
      where: { token },
      include: {
        user: true
      }
    });

    if (!session || session.expiresAt <= new Date()) {
      throw new UnauthorizedException("Invalid session");
    }

    return {
      token: session.token,
      user: {
        id: session.user.id,
        role: session.user.role,
        displayName: session.user.displayName
      }
    };
  }
}
