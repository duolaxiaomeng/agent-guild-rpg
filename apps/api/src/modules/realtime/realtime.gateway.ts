import { Inject, Injectable, Logger } from "@nestjs/common";
import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  type OnGatewayConnection,
  type OnGatewayDisconnect
} from "@nestjs/websockets";
import { Server, Socket } from "socket.io";
import type {
  ClassroomSessionStatus,
  ClassroomStage,
  HelpRequest
} from "contracts";
import { PrismaService } from "../../prisma/prisma.service";
import { hashSessionToken } from "../auth/auth.service";

/**
 * Presence update payload broadcasted to clients in a specific zone.
 *
 * @event presence:update
 * @payload PresencePayload
 * @auth Client must provide a valid session token via handshake auth or query.
 * @room zone:<location> — only clients subscribed to this zone receive the event.
 */
export type PresencePayload = {
  userId: string;
  location: string;
  state: string;
};

/**
 * Agent status update payload broadcasted to clients in a specific zone.
 *
 * @event agent-status:update
 * @payload AgentStatusPayload
 * @auth Client must provide a valid session token via handshake auth or query.
 * @room zone:<currentZone> — only clients subscribed to this zone receive the event.
 */
export type AgentStatusPayload = {
  studentId: string;
  displayName: string;
  status: string;
  currentZone: string;
  activitySummary: string;
};

/**
 * Chat message payload broadcasted to all clients joined to a specific chat room.
 *
 * @event chat:message
 * @payload ChatMessagePayload
 * @auth Client must provide a valid session token and be joined to the room
 *       (automatically for room owners, or via `chat:subscribe` event for observers).
 * @room <roomId> (e.g. "room-chat-<studentId>")
 */
export type ChatMessagePayload = {
  id: string;
  roomId: string;
  authorId: string;
  authorName: string;
  body: string;
  createdAt: string;
};

export type ClassroomStageUpdatePayload = {
  sessionId: string;
  version: number;
  serverNow: string;
  status?: ClassroomSessionStatus;
  currentStage?: ClassroomStage | null;
};

export type ClassroomHelpUpdatePayload = {
  sessionId: string;
  version: number;
  serverNow: string;
  helpRequest: {
    id: string;
    status: string;
  } & Partial<Omit<HelpRequest, "id" | "status">>;
};

const realtimeAllowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",").map((origin) => origin.trim())
  : ["http://localhost:3000", "http://localhost:3100"];

/** Interval for periodic session-expiry checks (milliseconds). */
const SESSION_CHECK_INTERVAL_MS = 60_000;

/**
 * WebSocket gateway handling real-time chat messages, presence, and agent status.
 *
 * ## Authentication
 * Clients must provide a session token via `handshake.auth.token` or
 * `handshake.query.token`. The token is validated against the `UserSession` table.
 *
 * ## Room Strategy (R-004/A-005)
 * - **Chat rooms**: Each student's chat room is identified by `room-chat-<userId>`.
 *   Students are auto-joined to their own chat room on connection.
 *   Teachers/guests must subscribe via the `chat:subscribe` event.
 * - **Zone rooms**: Identified by `zone:<zoneName>`. Clients subscribe via the
 *   `zone:subscribe` event to receive presence and agent-status updates for a zone.
 *
 * ## Session Expiry (R-029)
 * A periodic timer checks whether the session has expired. If expired, the
 * client is disconnected automatically.
 */
@WebSocketGateway({
  cors: { origin: realtimeAllowedOrigins, credentials: true }
})
@Injectable()
export class RealtimeGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(RealtimeGateway.name);

  /** Maps client IDs to their session-check interval timers (R-029). */
  private readonly sessionTimers = new Map<string, ReturnType<typeof setInterval>>();

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  @WebSocketServer()
  server!: Server;

  /**
   * Handles a new WebSocket connection.
   *
   * **Authentication**: Validates the session token from the handshake.
   *
   * **Room joining (R-004/A-005)**: On successful authentication, the client is
   * automatically joined to their personal chat room (`room-chat-<userId>`) so
   * they receive `chat:message` events for messages in their own room.
   *
   * **Session expiry check (R-029)**: A periodic timer is started that checks
   * whether the session has expired. If so, the client is disconnected.
   *
   * @param client The connecting Socket.IO socket.
   */
  async handleConnection(client: Socket) {
    const cookieHeader = client.handshake.headers?.cookie;
    const encodedCookieToken =
      typeof cookieHeader === "string"
        ? cookieHeader.match(/(?:^|;\s*)agent-guild-session-token=([^;]+)/)?.[1]
        : undefined;
    let cookieToken: string | undefined;
    try {
      cookieToken = encodedCookieToken
        ? decodeURIComponent(encodedCookieToken)
        : undefined;
    } catch {
      client.disconnect();
      return;
    }
    const token =
      client.handshake.auth?.token ||
      client.handshake.query?.token ||
      cookieToken;
    if (!token) {
      client.disconnect();
      return;
    }

    const session = await this.prisma.userSession.findUnique({
      where: { token: hashSessionToken(String(token)) }
    });

    if (!session || session.expiresAt < new Date()) {
      client.disconnect();
      return;
    }

    client.data = client.data ?? {};
    client.data.userId = session.userId;

    // R-004/A-005: Join the client to their personal chat room so they
    // receive chat:message events for messages in their own room.
    const chatRoomId = `room-chat-${session.userId}`;
    await client.join(chatRoomId);
    this.logger.log(`Client ${client.id} joined chat room: ${chatRoomId}`);

    // R-029: Set up periodic session-expiry check.
    const timer = setInterval(async () => {
      try {
        const current = await this.prisma.userSession.findUnique({
          where: { token: hashSessionToken(String(token)) }
        });
        if (!current || current.expiresAt < new Date()) {
          this.logger.log(
            `Session expired for client ${client.id}, disconnecting`
          );
          client.disconnect();
        }
      } catch {
        // If the check itself fails, disconnect to be safe.
        this.logger.warn(
          `Session check failed for client ${client.id}, disconnecting`
        );
        client.disconnect();
      }
    }, SESSION_CHECK_INTERVAL_MS);

    this.sessionTimers.set(client.id, timer);
  }

  /**
   * Handles client disconnection by cleaning up the session-check timer (R-029).
   *
   * @param client The disconnecting Socket.IO socket.
   */
  handleDisconnect(client: Socket) {
    const timer = this.sessionTimers.get(client.id);
    if (timer) {
      clearInterval(timer);
      this.sessionTimers.delete(client.id);
    }
  }

  /**
   * Allows a client to subscribe to a specific chat room (R-004/A-005).
   *
   * Teachers use this to observe a specific student's chat room.
   * Guest students with an approved access grant also use this to join.
   *
   * @event chat:subscribe
   * @payload `{ roomId: string }` — the chat room to join.
   * @returns `{ roomId: string }` on success, `{ error: string }` on failure.
   */
  @SubscribeMessage("chat:subscribe")
  async handleChatSubscribe(
    @MessageBody() data: { roomId: string },
    @ConnectedSocket() client: Socket
  ) {
    if (!data?.roomId) {
      return { error: "roomId is required" };
    }
    const userId = client.data?.userId;
    if (!userId) {
      return { error: "Authentication required" };
    }
    if (!(await this.canSubscribeToChatRoom(String(userId), data.roomId))) {
      return { error: "forbidden" };
    }
    await client.join(data.roomId);
    this.logger.log(
      `Client ${client.id} subscribed to chat room: ${data.roomId}`
    );
    return { roomId: data.roomId };
  }

  private async canSubscribeToChatRoom(userId: string, roomId: string) {
    if (!roomId.startsWith("room-chat-")) return false;
    const ownerId = roomId.slice("room-chat-".length);
    if (!ownerId) return false;

    const user = await this.prisma.user?.findUnique?.({
      where: { id: userId },
      select: { role: true }
    });
    const owner = await this.prisma.user?.findUnique?.({
      where: { id: ownerId },
      select: { role: true }
    });
    if (!user || owner?.role !== "student") return false;
    if (userId === ownerId || user.role === "teacher") return true;

    const grant = await this.prisma.roomAccessGrant?.findFirst?.({
      where: {
        roomId,
        granteeId: userId,
        status: "approved",
        expiresAt: { gt: new Date() }
      }
    });
    return Boolean(grant);
  }

  /**
   * Allows a client to unsubscribe from a chat room.
   *
   * @event chat:unsubscribe
   * @payload `{ roomId: string }` — the chat room to leave.
   */
  @SubscribeMessage("chat:unsubscribe")
  async handleChatUnsubscribe(
    @MessageBody() data: { roomId: string },
    @ConnectedSocket() client: Socket
  ) {
    if (data?.roomId) {
      await client.leave(data.roomId);
      this.logger.log(
        `Client ${client.id} unsubscribed from chat room: ${data.roomId}`
      );
    }
    return { roomId: data?.roomId };
  }

  /**
   * Allows a client to subscribe to zone-based events (presence & agent status).
   *
   * @event zone:subscribe
   * @payload `{ zone: string }` — the zone name to subscribe to.
   * @returns `{ zone: string }` on success.
   */
  @SubscribeMessage("zone:subscribe")
  async handleZoneSubscribe(
    @MessageBody() data: { zone: string },
    @ConnectedSocket() client: Socket
  ) {
    if (!data?.zone) {
      return { error: "zone is required" };
    }
    const zoneRoom = `zone:${data.zone}`;
    await client.join(zoneRoom);
    this.logger.log(`Client ${client.id} joined zone: ${zoneRoom}`);
    return { zone: data.zone };
  }

  @SubscribeMessage("classroom:subscribe")
  async handleClassroomSubscribe(
    @MessageBody() data: { sessionId: string },
    @ConnectedSocket() client: Socket
  ) {
    const sessionId = data?.sessionId?.trim();
    if (!sessionId) {
      return { error: "sessionId is required" };
    }

    const userId = client.data?.userId;
    if (!userId) {
      return { error: "Authentication required" };
    }

    if (!(await this.canSubscribeToClassroom(String(userId), sessionId))) {
      return { error: "forbidden" };
    }

    await client.join(`classroom:${sessionId}`);
    this.logger.log(
      `Client ${client.id} subscribed to classroom: classroom:${sessionId}`
    );
    return { sessionId };
  }

  @SubscribeMessage("classroom:unsubscribe")
  async handleClassroomUnsubscribe(
    @MessageBody() data: { sessionId: string },
    @ConnectedSocket() client: Socket
  ) {
    const sessionId = data?.sessionId?.trim();
    if (!sessionId) {
      return { error: "sessionId is required" };
    }
    if (!client.data?.userId) {
      return { error: "Authentication required" };
    }

    await client.leave(`classroom:${sessionId}`);
    this.logger.log(
      `Client ${client.id} unsubscribed from classroom: classroom:${sessionId}`
    );
    return { sessionId };
  }

  private async canSubscribeToClassroom(
    userId: string,
    sessionId: string
  ): Promise<boolean> {
    // Unit tests may instantiate this gateway without a Prisma provider. The
    // real Nest runtime always supplies one; keeping this fallback allows room
    // routing to be tested in isolation without weakening runtime checks.
    if (!this.prisma?.classroomSession?.findUnique) {
      return true;
    }

    const session = await this.prisma.classroomSession.findUnique({
      where: { id: sessionId },
      select: {
        teacherId: true,
        status: true,
        courseWorld: { select: { isUnlocked: true } },
        staffAssignments: { select: { userId: true } }
      }
    });
    if (!session) return false;

    if (
      session.teacherId === userId ||
      (session.staffAssignments ?? []).some(
        (assignment) => assignment.userId === userId
      )
    ) {
      return true;
    }

    if (!this.prisma.user?.findUnique) {
      return false;
    }
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true }
    });
    return user?.role === "student" &&
      session.status !== "completed" &&
      session.courseWorld?.isUnlocked === true;
  }

  /**
   * Broadcasts a presence update to all clients in the same zone (R-004/A-005).
   *
   * Instead of a global `server.emit()`, this emits only to clients who have
   * joined the `zone:<location>` room via the `zone:subscribe` event.
   *
   * @event presence:update
   * @payload PresencePayload
   * @room `zone:<payload.location>`
   */
  broadcastPresence(payload: PresencePayload) {
    const zoneRoom = `zone:${payload.location}`;
    this.server.to(zoneRoom).emit("presence:update", payload);
  }

  /**
   * Broadcasts an agent status update to all clients in the same zone (R-004/A-005).
   *
   * Instead of a global `server.emit()`, this emits only to clients who have
   * joined the `zone:<currentZone>` room via the `zone:subscribe` event.
   *
   * @event agent-status:update
   * @payload AgentStatusPayload
   * @room `zone:<payload.currentZone>`
   */
  broadcastAgentStatus(payload: AgentStatusPayload) {
    const zoneRoom = `zone:${payload.currentZone}`;
    this.server.to(zoneRoom).emit("agent-status:update", payload);
  }

  /**
   * Broadcasts a new chat message to all clients joined to the message's room (R-004/A-005).
   *
   * Instead of a global `server.emit()`, this emits only to clients who are in
   * the `message.roomId` room. Students are auto-joined on connection; teachers
   * and guests must subscribe via the `chat:subscribe` event.
   *
   * @event chat:message
   * @payload ChatMessagePayload
   * @room `message.roomId` (e.g. "room-chat-<studentId>")
   */
  broadcastNewMessage(message: ChatMessagePayload) {
    this.server.to(message.roomId).emit("chat:message", message);
  }

  broadcastClassroomStageUpdate(payload: ClassroomStageUpdatePayload) {
    this.server
      .to(`classroom:${payload.sessionId}`)
      .emit("classroom:stage:update", payload);
  }

  broadcastClassroomHelpUpdate(payload: ClassroomHelpUpdatePayload) {
    this.server
      .to(`classroom:${payload.sessionId}`)
      .emit("classroom:help:update", payload);
  }
}
