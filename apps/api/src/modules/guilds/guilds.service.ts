import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException
} from "@nestjs/common";
import {
  GuildMembershipRole,
  MembershipStatus,
  Prisma,
  UserRole
} from "@prisma/client";
import {
  createGuildInvitationSchema,
  createGuildSchema,
  type CreateGuild,
  type CreateGuildInvitation
} from "contracts";
import { PrismaService } from "../../prisma/prisma.service";

export type GuildActor = {
  id: string;
  role: UserRole;
  displayName: string;
};

type GuildTransaction = Prisma.TransactionClient;
type InvitationWithPeople = Prisma.GuildMembershipGetPayload<{
  include: {
    guild: true;
    user: true;
    invitedBy: true;
  };
}>;

@Injectable()
export class GuildsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService
  ) {}

  async list(actor: GuildActor) {
    const guilds = await this.prisma.guild.findMany({
      include: {
        memberships: {
          where: { status: MembershipStatus.active },
          select: {
            id: true,
            userId: true,
            role: true,
            status: true
          }
        }
      },
      orderBy: { name: "asc" }
    });

    return guilds.map((guild) => ({
      id: guild.id,
      name: guild.name,
      description: guild.description,
      memberCount: guild.memberships.length,
      collaborationPoints: guild.collaborationPoints,
      viewerMembership:
        guild.memberships.find((membership) => membership.userId === actor.id) ?? null
    }));
  }

  async create(input: CreateGuild, actor: GuildActor) {
    this.assertStudent(actor);
    const body = this.parseCreateGuild(input);

    try {
      return await this.prisma.$transaction(async (tx) => {
        await this.assertHasNoActiveGuild(tx, actor.id);

        const guild = await tx.guild.create({
          data: {
            name: body.name,
            description: body.description,
            ownerId: actor.id
          }
        });

        const membership = await tx.guildMembership.create({
          data: {
            guildId: guild.id,
            userId: actor.id,
            role: GuildMembershipRole.leader,
            status: MembershipStatus.active
          }
        });

        return {
          id: guild.id,
          name: guild.name,
          description: guild.description,
          memberCount: 1,
          collaborationPoints: guild.collaborationPoints,
          viewerMembership: this.toViewerMembership(membership)
        };
      });
    } catch (error) {
      this.rethrowUniqueConflict(error, "Guild name is already in use");
    }
  }

  async invite(
    guildId: string,
    input: CreateGuildInvitation,
    actor: GuildActor
  ) {
    this.assertStudent(actor);
    const body = this.parseInvitation(input);

    try {
      return await this.prisma.$transaction(async (tx) => {
        await this.assertLeader(tx, guildId, actor.id);

        const invitee = await tx.user.findUnique({
          where: { email: body.email },
          select: { id: true, email: true, displayName: true, role: true }
        });
        if (!invitee || invitee.role !== UserRole.student) {
          throw new BadRequestException("Student email was not found");
        }
        if (invitee.id === actor.id) {
          throw new BadRequestException("Guild leaders cannot invite themselves");
        }

        await this.assertHasNoActiveGuild(tx, invitee.id);

        const existing = await tx.guildMembership.findUnique({
          where: { guildId_userId: { guildId, userId: invitee.id } }
        });
        if (existing?.status === MembershipStatus.invited) {
          throw new ConflictException("A pending invitation already exists");
        }
        if (existing?.status === MembershipStatus.active) {
          throw new ConflictException("Student already belongs to this guild");
        }

        const now = new Date();
        const membership = existing
          ? await tx.guildMembership.update({
              where: { id: existing.id },
              data: {
                role: GuildMembershipRole.member,
                status: MembershipStatus.invited,
                invitedById: actor.id,
                invitedAt: now,
                respondedAt: null
              },
              include: { guild: true, user: true, invitedBy: true }
            })
          : await tx.guildMembership.create({
              data: {
                guildId,
                userId: invitee.id,
                role: GuildMembershipRole.member,
                status: MembershipStatus.invited,
                invitedById: actor.id,
                invitedAt: now
              },
              include: { guild: true, user: true, invitedBy: true }
            });

        return this.toInvitation(membership);
      });
    } catch (error) {
      this.rethrowUniqueConflict(error, "A pending invitation already exists");
    }
  }

  async listMyInvitations(actor: GuildActor) {
    this.assertStudent(actor);
    const invitations = await this.prisma.guildMembership.findMany({
      where: {
        userId: actor.id,
        invitedAt: { not: null }
      },
      include: { guild: true, user: true, invitedBy: true },
      orderBy: { invitedAt: "desc" }
    });

    return invitations.map((invitation) => this.toInvitation(invitation));
  }

  async acceptInvitation(invitationId: string, actor: GuildActor) {
    this.assertStudent(actor);

    try {
      return await this.prisma.$transaction(async (tx) => {
        const invitation = await this.getInvitation(tx, invitationId, actor.id);
        this.assertPending(invitation);
        await this.assertHasNoActiveGuild(tx, actor.id);

        const respondedAt = new Date();
        const accepted = await tx.guildMembership.update({
          where: { id: invitation.id },
          data: {
            role: GuildMembershipRole.member,
            status: MembershipStatus.active,
            respondedAt
          },
          include: { guild: true, user: true, invitedBy: true }
        });

        await tx.guildMembership.updateMany({
          where: {
            userId: actor.id,
            status: MembershipStatus.invited,
            id: { not: invitation.id }
          },
          data: {
            status: MembershipStatus.declined,
            respondedAt
          }
        });

        return this.toInvitation(accepted);
      });
    } catch (error) {
      this.rethrowUniqueConflict(error, "Student already belongs to a guild");
    }
  }

  async declineInvitation(invitationId: string, actor: GuildActor) {
    this.assertStudent(actor);

    return this.prisma.$transaction(async (tx) => {
      const invitation = await this.getInvitation(tx, invitationId, actor.id);
      this.assertPending(invitation);
      const declined = await tx.guildMembership.update({
        where: { id: invitation.id },
        data: {
          status: MembershipStatus.declined,
          respondedAt: new Date()
        },
        include: { guild: true, user: true, invitedBy: true }
      });
      return this.toInvitation(declined);
    });
  }

  async listMembers(guildId: string) {
    const guild = await this.prisma.guild.findUnique({
      where: { id: guildId },
      select: { id: true }
    });
    if (!guild) {
      throw new NotFoundException("Guild was not found");
    }

    const memberships = await this.prisma.guildMembership.findMany({
      where: { guildId, status: MembershipStatus.active },
      include: { user: true },
      orderBy: [{ role: "asc" }, { createdAt: "asc" }]
    });

    return memberships.map((membership) => ({
      id: membership.id,
      guildId: membership.guildId,
      userId: membership.userId,
      displayName: membership.user.displayName,
      email: membership.user.email,
      role: membership.role,
      status: membership.status,
      createdAt: membership.createdAt.toISOString(),
      updatedAt: membership.updatedAt.toISOString()
    }));
  }

  async removeMember(guildId: string, userId: string, actor: GuildActor) {
    this.assertStudent(actor);

    return this.prisma.$transaction(async (tx) => {
      await this.assertLeader(tx, guildId, actor.id);
      if (userId === actor.id) {
        throw new ConflictException("Guild leaders cannot remove themselves");
      }

      const membership = await tx.guildMembership.findUnique({
        where: { guildId_userId: { guildId, userId } }
      });
      if (!membership || membership.status !== MembershipStatus.active) {
        throw new NotFoundException("Active guild member was not found");
      }
      if (membership.role === GuildMembershipRole.leader) {
        throw new ConflictException("Guild leaders cannot be removed");
      }

      const removed = await tx.guildMembership.update({
        where: { id: membership.id },
        data: { status: MembershipStatus.removed }
      });
      return {
        id: removed.id,
        guildId: removed.guildId,
        userId: removed.userId,
        role: removed.role,
        status: removed.status,
        removedAt: removed.updatedAt.toISOString()
      };
    });
  }

  private parseCreateGuild(input: CreateGuild) {
    const parsed = createGuildSchema.safeParse(input);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues[0]?.message ?? "Invalid guild");
    }
    return parsed.data;
  }

  private parseInvitation(input: CreateGuildInvitation) {
    const parsed = createGuildInvitationSchema.safeParse(input);
    if (!parsed.success) {
      throw new BadRequestException(
        parsed.error.issues[0]?.message ?? "Invalid invitation"
      );
    }
    return { email: parsed.data.email.toLowerCase() };
  }

  private assertStudent(actor: GuildActor) {
    if (actor.role !== UserRole.student) {
      throw new ForbiddenException("Student access required");
    }
  }

  private async assertHasNoActiveGuild(tx: GuildTransaction, userId: string) {
    const activeMembership = await tx.guildMembership.findFirst({
      where: { userId, status: MembershipStatus.active },
      select: { id: true }
    });
    if (activeMembership) {
      throw new ConflictException("Student already belongs to a guild");
    }
  }

  private async assertLeader(
    tx: GuildTransaction,
    guildId: string,
    userId: string
  ) {
    const guild = await tx.guild.findUnique({
      where: { id: guildId },
      select: { id: true, ownerId: true }
    });
    if (!guild) {
      throw new NotFoundException("Guild was not found");
    }

    const membership = await tx.guildMembership.findUnique({
      where: { guildId_userId: { guildId, userId } },
      select: { role: true, status: true }
    });
    if (
      guild.ownerId !== userId ||
      membership?.role !== GuildMembershipRole.leader ||
      membership.status !== MembershipStatus.active
    ) {
      throw new ForbiddenException("Guild leader access required");
    }
  }

  private async getInvitation(
    tx: GuildTransaction,
    invitationId: string,
    userId: string
  ) {
    const invitation = await tx.guildMembership.findUnique({
      where: { id: invitationId },
      include: { guild: true, user: true, invitedBy: true }
    });
    if (!invitation || invitation.invitedAt === null) {
      throw new NotFoundException("Guild invitation was not found");
    }
    if (invitation.userId !== userId) {
      throw new ForbiddenException("Only the invitee can respond to this invitation");
    }
    return invitation;
  }

  private assertPending(invitation: InvitationWithPeople) {
    if (invitation.status !== MembershipStatus.invited) {
      throw new ConflictException("Guild invitation has already been answered");
    }
  }

  private toInvitation(invitation: InvitationWithPeople) {
    return {
      id: invitation.id,
      guildId: invitation.guildId,
      userId: invitation.userId,
      role: invitation.role,
      status: invitation.status,
      invitedById: invitation.invitedById,
      invitedAt: invitation.invitedAt?.toISOString() ?? null,
      respondedAt: invitation.respondedAt?.toISOString() ?? null,
      createdAt: invitation.createdAt.toISOString(),
      updatedAt: invitation.updatedAt.toISOString(),
      guildName: invitation.guild.name,
      inviterName: invitation.invitedBy?.displayName ?? "Unknown inviter",
      inviteeEmail: invitation.user.email
    };
  }

  private toViewerMembership(membership: {
    id: string;
    userId: string;
    role: GuildMembershipRole;
    status: MembershipStatus;
  }) {
    return {
      id: membership.id,
      userId: membership.userId,
      role: membership.role,
      status: membership.status
    };
  }

  private rethrowUniqueConflict(error: unknown, message: string): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw new ConflictException(message);
    }
    throw error;
  }
}
