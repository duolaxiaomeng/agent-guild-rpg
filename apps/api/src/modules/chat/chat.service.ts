import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException
} from "@nestjs/common";
import {
  AgentConnectorStatus,
  AgentSessionStatus,
  UserRole
} from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { RealtimeGateway } from "../realtime/realtime.gateway";

type CurrentUser = {
  id: string;
  role: UserRole;
  displayName: string;
};

@Injectable()
export class ChatService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(RealtimeGateway) private readonly gateway: RealtimeGateway
  ) {}

  async getRoomPayload(
    requestedStudentId: string | undefined,
    requestedRoomId: string | undefined,
    user: CurrentUser,
    before?: string
  ) {
    if (user.role !== UserRole.student && user.role !== UserRole.teacher) {
      throw new ForbiddenException("Student or teacher access required");
    }

    if (
      user.role === UserRole.student &&
      requestedStudentId &&
      requestedStudentId !== user.id
    ) {
      throw new ForbiddenException("Cannot access another student's chat overview");
    }

    // Teacher without roomId: return a list of available chat rooms
    if (user.role === UserRole.teacher && !requestedRoomId && !requestedStudentId) {
      return this.getTeacherRoomOverview();
    }

    if (user.role === UserRole.teacher && !requestedRoomId) {
      throw new BadRequestException("Teacher must specify a room ID");
    }

    const ownerId = requestedRoomId
      ? this.getRoomOwnerId(requestedRoomId)
      : (requestedStudentId ?? user.id);
    const roomId = requestedRoomId ?? this.toRoomId(ownerId);
    const viewerRole = await this.resolveViewerRole(roomId, user);

    const student = await this.prisma.user.findUnique({
      where: { id: ownerId },
      include: {
        agentSessions: {
          include: {
            connector: {
              select: { status: true, lastSeenAt: true }
            }
          },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: 1
        },
        submissions: {
          include: {
            day: true,
            reviewResult: true
          },
          orderBy: [{ submittedAt: "desc" }, { id: "desc" }],
          take: 1
        }
      }
    });

    if (!student) {
      throw new NotFoundException("Student not found");
    }

    if (user.role === UserRole.teacher && student.role !== UserRole.student) {
      throw new ForbiddenException("Teacher can only observe student rooms");
    }

    const contributionLogs = await this.prisma.contributionLog.findMany({
      where: {
        targetUserId: ownerId
      },
      include: {
        actor: true
      },
      orderBy: [{ points: "desc" }, { id: "asc" }]
    });

    // R-013: Cursor-based pagination using `before` timestamp.
    // Fetch PAGE_SIZE + 1 to determine if there are more messages.
    const PAGE_SIZE = 50;
    const rawMessages = await this.prisma.chatMessage.findMany({
      where: {
        roomId,
        ...(before ? { createdAt: { lt: new Date(before) } } : {})
      },
      include: {
        author: {
          select: {
            id: true,
            displayName: true
          }
        }
      },
      take: PAGE_SIZE + 1,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }]
    });

    const hasMore = rawMessages.length > PAGE_SIZE;
    const messages = hasMore ? rawMessages.slice(0, PAGE_SIZE) : rawMessages;
    messages.reverse();

    const latestSession = student.agentSessions[0];
    const latestSubmission = student.submissions[0];
    const connectorIsFresh = Boolean(
      latestSession?.status !== AgentSessionStatus.failed &&
      latestSession.connector?.status === AgentConnectorStatus.online &&
      latestSession.connector.lastSeenAt >= new Date(Date.now() - 75_000)
    );
    const contributionByActor = new Map<
      string,
      { studentId: string; studentName: string; points: number }
    >();

    for (const log of contributionLogs) {
      const existing = contributionByActor.get(log.actorId);

      if (existing) {
        existing.points += log.points;
        continue;
      }

      contributionByActor.set(log.actorId, {
        studentId: log.actorId,
        studentName: log.actor.displayName,
        points: log.points
      });
    }

    return {
      roomId,
      viewerRole,
      hasMore,
      studentId: student.id,
      studentName: student.displayName,
      agentSessionId: connectorIsFresh ? latestSession?.id ?? null : null,
      canSubmit: viewerRole === "owner" && connectorIsFresh,
      agentLabel: this.toAgentLabel(latestSession?.provider),
      sessionStatus: latestSession?.status ?? "failed",
      sessionSummary:
        latestSubmission?.conversationSummary ?? "今天还没有新的会话摘要。",
      latestSubmission: latestSubmission
        ? {
            id: latestSubmission.id,
            statusLabel:
              latestSubmission.reviewResult?.reviewerId == null
                ? "待老师审核"
                : "已完成裁定",
            submittedAt: latestSubmission.submittedAt.toISOString(),
            dayLabel: this.toDayLabel(latestSubmission.day.id)
          }
        : null,
      collaborationGuests: [...contributionByActor.values()]
        .sort((left, right) => right.points - left.points)
        .map((guest) => ({
          studentId: guest.studentId,
          studentName: guest.studentName,
          contributionLabel: `协作贡献 ${guest.points}`
        })),
      messages: messages.map((message) => ({
        id: message.id,
        roomId: message.roomId,
        authorId: message.authorId,
        authorName: message.author.displayName,
        body: message.body,
        createdAt: message.createdAt.toISOString()
      }))
    };
  }

  /**
   * Returns a list of chat rooms (A-010).
   * Teachers see all student rooms; students see their own room.
   */
  async getRoomsList(user: CurrentUser) {
    if (user.role !== UserRole.teacher && user.role !== UserRole.student) {
      throw new ForbiddenException("Student or teacher access required");
    }

    if (user.role === UserRole.teacher) {
      return this.getTeacherRoomOverview();
    }

    // Students: return their own room
    const roomId = this.toRoomId(user.id);
    const lastMessage = await this.prisma.chatMessage.findFirst({
      where: { roomId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }]
    });

    return {
      rooms: [
        {
          roomId,
          studentName: user.displayName,
          lastMessagePreview: lastMessage
            ? lastMessage.body.slice(0, 80)
            : null
        }
      ]
    };
  }

  /**
   * Returns the full detail of a specific chat room (A-010).
   * Supports `before` cursor pagination for messages (R-013).
   */
  async getRoomDetail(
    roomId: string,
    before: string | undefined,
    user: CurrentUser
  ) {
    return this.getRoomPayload(undefined, roomId, user, before);
  }

  /**
   * Return an overview of all available chat rooms for teachers.
   * Each room includes the student name and a preview of the last message.
   */
  private async getTeacherRoomOverview() {
    const students = await this.prisma.user.findMany({
      where: { role: UserRole.student },
      select: { id: true, displayName: true }
    });

    if (students.length === 0) {
      return { rooms: [] };
    }

    const roomIds = students.map((s) => this.toRoomId(s.id));

    // R-006: Use distinct + take to fetch only the latest message per room,
    // instead of loading all messages into memory.
    const lastMessages = await this.prisma.chatMessage.findMany({
      where: { roomId: { in: roomIds } },
      distinct: ["roomId"],
      include: {
        author: {
          select: { id: true, displayName: true }
        }
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: roomIds.length
    });

    const lastMessageByRoom = new Map<string, { body: string; createdAt: Date }>();
    for (const msg of lastMessages) {
      if (!lastMessageByRoom.has(msg.roomId)) {
        lastMessageByRoom.set(msg.roomId, { body: msg.body, createdAt: msg.createdAt });
      }
    }

    const rooms = students.map((student) => {
      const roomId = this.toRoomId(student.id);
      const lastMsg = lastMessageByRoom.get(roomId);
      return {
        roomId,
        studentName: student.displayName,
        lastMessagePreview: lastMsg ? lastMsg.body.slice(0, 80) : null
      };
    });

    return { rooms };
  }

  async createMessage(roomId: string, content: string, user: CurrentUser) {
    // R-010: Teachers have read-only access and cannot post messages.
    if (user.role === UserRole.teacher) {
      throw new ForbiddenException(
        "Teachers have read-only access to chat rooms"
      );
    }

    if (user.role !== UserRole.student) {
      throw new ForbiddenException("Student access required to post messages");
    }

    // A-012: `content` is the API field name; maps to the model's `body` column.
    const trimmedContent = content.trim();

    if (!trimmedContent) {
      throw new BadRequestException("Message content is required");
    }

    await this.resolveViewerRole(roomId, user);

    const message = await this.prisma.chatMessage.create({
      data: {
        roomId,
        authorId: user.id,
        body: trimmedContent // A-012: maps content → model's body field
      },
      include: {
        author: {
          select: {
            id: true,
            displayName: true
          }
        }
      }
    });

    const payload = {
      id: message.id,
      roomId: message.roomId,
      authorId: message.authorId,
      authorName: message.author.displayName,
      body: message.body,
      createdAt: message.createdAt.toISOString()
    };

    this.gateway.broadcastNewMessage(payload);

    return payload;
  }

  private async resolveViewerRole(roomId: string, user: CurrentUser) {
    if (user.role === UserRole.teacher) {
      return "teacher" as const;
    }

    const ownerId = this.getRoomOwnerId(roomId);

    if (ownerId === user.id) {
      return "owner" as const;
    }

    const activeGrant = await this.prisma.roomAccessGrant.findFirst({
      where: {
        roomId,
        granteeId: user.id,
        status: "approved",
        expiresAt: {
          gt: new Date()
        }
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }]
    });

    if (!activeGrant) {
      throw new ForbiddenException("Cannot access this chat room");
    }

    return "guest" as const;
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

  private toRoomId(studentId: string) {
    return `room-chat-${studentId}`;
  }

  private toAgentLabel(provider?: string) {
    if (provider === "claude-code") {
      return "Claude Code";
    }

    if (provider === "codex") {
      return "Codex";
    }

    return provider ?? "Unknown Agent";
  }

  private toDayLabel(dayId: string) {
    return `Day ${dayId.replace("day-", "")}`;
  }
}
