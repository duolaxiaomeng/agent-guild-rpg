import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
  type OnModuleDestroy,
  type OnModuleInit
} from "@nestjs/common";
import * as bcrypt from "bcrypt";
import * as crypto from "crypto";
import { Prisma, RoomType, UserRole } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";

const SESSION_TTL_MS = 8 * 60 * 60 * 1000; // 8 hours
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
const DEFAULT_REGISTRATION_INTERNAL_CODE = "chuangshuo_agent_one";

export function hashSessionToken(rawToken: string) {
  return crypto.createHash("sha256").update(rawToken).digest("hex");
}

@Injectable()
export class AuthService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AuthService.name);
  private cleanupTimer?: ReturnType<typeof setInterval>;

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /**
   * R-022: Hash the raw token with SHA-256 before storage/lookup.
   * The raw token is only ever returned to the client at login time.
   */
  hashToken(rawToken: string): string {
    return hashSessionToken(rawToken);
  }

  async onModuleInit() {
    // R-026: Periodically clean up expired sessions
    this.cleanupTimer = setInterval(() => {
      this.cleanupExpiredSessions().catch((err: unknown) => {
        this.logger.error(
          `Session cleanup failed: ${err instanceof Error ? err.message : String(err)}`
        );
      });
    }, CLEANUP_INTERVAL_MS);
    // Run once at startup
    this.cleanupExpiredSessions().catch((err: unknown) => {
      this.logger.error(
        `Initial session cleanup failed: ${err instanceof Error ? err.message : String(err)}`
      );
    });
  }

  async onModuleDestroy() {
    if (this.cleanupTimer) clearInterval(this.cleanupTimer);
  }

  private async cleanupExpiredSessions() {
    const result = await this.prisma.userSession.deleteMany({
      where: { expiresAt: { lt: new Date() } }
    });
    if (result.count > 0) {
      this.logger.log(`Cleaned up ${result.count} expired sessions`);
    }
  }

  async login(email: string, password: string) {
    const user = await this.prisma.user.findUnique({
      where: { email }
    });

    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      throw new UnauthorizedException("Invalid credentials");
    }

    return this.createSession(user);
  }

  async register(input: {
    displayName: string;
    email: string;
    password: string;
    registrationCode: string;
  }) {
    if (!this.isValidRegistrationCode(input.registrationCode)) {
      throw new ForbiddenException("Invalid registration code");
    }

    const normalizedEmail = input.email.trim().toLowerCase();
    const displayName = input.displayName.trim();
    if (!displayName) {
      throw new BadRequestException("Display name is required");
    }
    const existingUser = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: { id: true }
    });
    if (existingUser) {
      throw new ConflictException("Email is already registered");
    }

    const passwordHash = await bcrypt.hash(input.password, 12);
    let user: { id: string; role: UserRole; displayName: string };
    try {
      user = await this.prisma.$transaction(async (tx) => {
        const createdUser = await tx.user.create({
          data: {
            role: UserRole.student,
            email: normalizedEmail,
            passwordHash,
            displayName
          }
        });
        const homestead = await tx.homestead.create({
          data: {
            ownerId: createdUser.id,
            title: `${displayName} 的工坊`
          }
        });
        await tx.room.create({
          data: {
            id: `room-chat-${createdUser.id}`,
            homesteadId: homestead.id,
            type: RoomType.chat_room,
            name: `${displayName} 的聊天室`
          }
        });
        return createdUser;
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        throw new ConflictException("Email is already registered");
      }
      throw error;
    }

    return this.createSession(user);
  }

  private async createSession(user: {
    id: string;
    role: UserRole;
    displayName: string;
  }) {
    // R-022: Generate raw token but store its SHA-256 hash
    const rawToken = `session_${crypto.randomBytes(32).toString("hex")}`;
    const session = await this.prisma.userSession.create({
      data: {
        userId: user.id,
        token: this.hashToken(rawToken),
        expiresAt: new Date(Date.now() + SESSION_TTL_MS)
      }
    });

    // A-014: Return expiresAt so the client can track session expiry
    return {
      token: rawToken,
      expiresAt: session.expiresAt.toISOString(),
      user: {
        id: user.id,
        role: user.role,
        displayName: user.displayName
      }
    };
  }

  private isValidRegistrationCode(value: string) {
    const expected = Buffer.from(
      process.env.REGISTRATION_INTERNAL_CODE ?? DEFAULT_REGISTRATION_INTERNAL_CODE
    );
    const provided = Buffer.from(value);
    return (
      expected.length === provided.length &&
      crypto.timingSafeEqual(expected, provided)
    );
  }

  async getSession(rawToken: string) {
    if (!rawToken) {
      throw new UnauthorizedException("Invalid session");
    }

    // R-022: Look up by token hash, not the raw token
    const tokenHash = this.hashToken(rawToken);

    // R-025: Select only the fields we actually need
    const session = await this.prisma.userSession.findUnique({
      where: { token: tokenHash },
      select: {
        id: true,
        expiresAt: true,
        user: {
          select: {
            id: true,
            role: true,
            displayName: true
          }
        }
      }
    });

    if (!session) {
      throw new UnauthorizedException("Invalid session");
    }

    if (session.expiresAt <= new Date()) {
      await this.prisma.userSession.delete({ where: { id: session.id } });
      throw new UnauthorizedException("Session expired");
    }

    return {
      token: rawToken,
      user: {
        id: session.user.id,
        role: session.user.role,
        displayName: session.user.displayName
      }
    };
  }

  /**
   * R-011: Logout only the current session (by token), not all user sessions.
   */
  async logout(rawToken: string) {
    if (!rawToken) return;
    const tokenHash = this.hashToken(rawToken);
    await this.prisma.userSession.deleteMany({
      where: { token: tokenHash }
    });
  }
}
