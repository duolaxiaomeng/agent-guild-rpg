import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  UnauthorizedException
} from "@nestjs/common";
import { AgentConnectorStatus, Prisma } from "@prisma/client";
import * as crypto from "crypto";
import { PrismaService } from "../../prisma/prisma.service";
import {
  WORKSTATION_HOME_BY_VISUAL_ROLE,
  initialWorkstationRoleSchema,
} from "contracts";
import { resolveAgentVisualRole } from "../agent-team/agent-team.mapping";

const PAIRING_TTL_MS = 10 * 60 * 1000;
const CONNECTOR_STALE_AFTER_MS = 75 * 1000;
const CREDENTIAL_PREFIX = "agc1";
const DEVELOPMENT_CREDENTIAL_SIGNING_SECRET = "agent-guild-development-connector-credential-secret";

type ConnectorInput = {
  connectionCredential: string;
  provider: string;
  clientName: string;
  capabilities: string[];
  roleKey?: string;
};

type ConnectionCredentialPayload = {
  version: 1;
  serverUrl: string;
  studentId: string;
  pairingSecret: string;
  expiresAt: string;
};

type HeartbeatInput = {
  status: "online" | "offline";
};

type EventInput = {
  eventId?: string;
  dayId: string;
  type: string;
  payload: Record<string, unknown>;
  occurredAt?: string;
};

@Injectable()
export class AgentConnectorsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async createPairing(studentId: string, serverUrl: string) {
    const now = new Date();
    await this.prisma.agentPairing.updateMany({
      where: {
        studentId,
        usedAt: null,
        expiresAt: { gt: now }
      },
      data: { usedAt: now }
    });

    const pairingSecret = crypto.randomBytes(32).toString("base64url");
    const pairing = await this.prisma.agentPairing.create({
      data: {
        studentId,
        codeHash: this.hashSecret(pairingSecret),
        expiresAt: new Date(now.getTime() + PAIRING_TTL_MS)
      }
    });

    return {
      connectionCredential: this.createConnectionCredential({
        version: 1,
        serverUrl: this.normalizeServerUrl(serverUrl),
        studentId,
        pairingSecret,
        expiresAt: pairing.expiresAt.toISOString()
      }),
      expiresAt: pairing.expiresAt.toISOString()
    };
  }

  async connect(input: ConnectorInput) {
    if (input.roleKey && !initialWorkstationRoleSchema.safeParse(input.roleKey).success) {
      throw new BadRequestException(`Unknown Agent role: ${input.roleKey}`);
    }
    const now = new Date();
    const credential = this.parseConnectionCredential(input.connectionCredential);
    const pairing = await this.prisma.agentPairing.findUnique({
      where: { codeHash: this.hashSecret(credential.pairingSecret) }
    });

    if (
      !pairing ||
      pairing.studentId !== credential.studentId ||
      pairing.usedAt ||
      pairing.expiresAt <= now ||
      new Date(credential.expiresAt) <= now
    ) {
      throw new BadRequestException("Connection credential is invalid or expired");
    }

    const connectorToken = `connector_${crypto.randomBytes(32).toString("hex")}`;
    const connectorTokenHash = this.hashSecret(connectorToken);

    const result = await this.prisma.$transaction(async (tx) => {
      const owner = await tx.user.findUniqueOrThrow({
        where: { id: pairing.studentId },
        select: {
          role: true,
          agentTeamBinding: { select: { roleKey: true } },
        },
      });
      let selectedRoleKey = owner.agentTeamBinding?.roleKey ?? null;
      if (owner.role === "student" && input.roleKey) {
        const roleChanged = selectedRoleKey !== input.roleKey;
        selectedRoleKey = input.roleKey;
        await tx.agentTeamBinding.upsert({
          where: { studentId: pairing.studentId },
          create: { studentId: pairing.studentId, roleKey: input.roleKey },
          update: { roleKey: input.roleKey },
        });

        const visualRole = resolveAgentVisualRole(input.roleKey);
        if (visualRole) {
          const home = WORKSTATION_HOME_BY_VISUAL_ROLE[visualRole];
          await tx.agentWorldState.upsert({
            where: { studentId: pairing.studentId },
            create: {
              studentId: pairing.studentId,
              currentZone: "workstations",
              positionX: home.x,
              positionY: home.y,
              facing: home.facing,
            },
            update: roleChanged
              ? {
                  currentZone: "workstations",
                  positionX: home.x,
                  positionY: home.y,
                  facing: home.facing,
                  revision: { increment: 1 },
                }
              : {},
          });
        }
      }

      const agentSession = await tx.agentSession.create({
        data: {
          studentId: pairing.studentId,
          provider: input.provider,
          status: "active"
        }
      });

      const created = await tx.agentConnector.create({
        data: {
          studentId: pairing.studentId,
          agentSessionId: agentSession.id,
          provider: input.provider,
          clientName: input.clientName,
          tokenHash: connectorTokenHash,
          status: AgentConnectorStatus.online,
          capabilities: input.capabilities as Prisma.InputJsonValue,
          connectedAt: now,
          lastSeenAt: now
        }
      });

      await tx.agentPairing.update({
        where: { id: pairing.id },
        data: { usedAt: now }
      });

      return { connector: created, roleKey: selectedRoleKey };
    });

    const connector = result.connector;
    const visualRole = result.roleKey
      ? resolveAgentVisualRole(result.roleKey)
      : null;

    return {
      connectorId: connector.id,
      agentSessionId: connector.agentSessionId,
      connectorToken,
      provider: connector.provider,
      clientName: connector.clientName,
      status: connector.status,
      capabilities: this.toStringArray(connector.capabilities),
      roleKey: result.roleKey,
      visualRole,
      connectedAt: connector.connectedAt.toISOString(),
      lastSeenAt: connector.lastSeenAt.toISOString()
    };
  }

  async getStudentProfile(studentId: string) {
    await this.markStaleConnectorsOffline();
    const connector = await this.prisma.agentConnector.findFirst({
      where: { studentId, status: { not: AgentConnectorStatus.revoked } },
      orderBy: { lastSeenAt: "desc" },
      include: {
        student: { select: { agentTeamBinding: { select: { roleKey: true } } } },
      },
    });

    return connector
      ? this.toProfile(connector, connector.student.agentTeamBinding?.roleKey)
      : null;
  }

  async heartbeat(token: string, input: HeartbeatInput) {
    const connector = await this.authenticateConnectorToken(token);
    const updated = await this.prisma.agentConnector.update({
      where: { id: connector.id },
      data: {
        status: input.status === "online" ? AgentConnectorStatus.online : AgentConnectorStatus.offline,
        lastSeenAt: new Date()
      }
    });

    return {
      connectorId: updated.id,
      status: updated.status,
      lastSeenAt: updated.lastSeenAt.toISOString()
    };
  }

  async recordEvent(token: string, input: EventInput) {
    const connector = await this.authenticateConnectorToken(token);
    const [event] = await this.persistEvents(connector, [{
      ...input,
      eventId: input.eventId ?? crypto.randomUUID(),
      occurredAt: input.occurredAt ?? new Date().toISOString()
    }]);
    return event;
  }

  async recordEvents(
    token: string,
    inputs: Array<EventInput & { eventId: string; occurredAt: string }>
  ) {
    const connector = await this.authenticateConnectorToken(token);
    if (inputs.length < 1 || inputs.length > 100) {
      throw new BadRequestException("events must contain between 1 and 100 items");
    }
    const eventIds = new Set(inputs.map((event) => event.eventId));
    if (eventIds.size !== inputs.length) {
      throw new BadRequestException("eventId values must be unique within a batch");
    }
    return { events: await this.persistEvents(connector, inputs) };
  }

  async listEvents(studentId: string, dayId?: string) {
    const events = await this.prisma.agentEvent.findMany({
      where: {
        studentId,
        ...(dayId ? { dayId } : {})
      },
      orderBy: [{ occurredAt: "asc" }, { createdAt: "asc" }]
    });

    return events.map((event) => this.toEvent(event));
  }

  async listConnectorEvents(
    token: string,
    cursor?: string,
    rawLimit?: string | number
  ) {
    const connector = await this.authenticateConnectorToken(token);
    const limit = this.parseCursorLimit(rawLimit);
    const cursorEvent = cursor
      ? await this.prisma.agentEvent.findFirst({
          where: { id: cursor, connectorId: connector.id },
          select: { id: true, occurredAt: true }
        })
      : null;
    if (cursor && !cursorEvent) {
      throw new BadRequestException("Event cursor is invalid for this connector");
    }

    const events = await this.prisma.agentEvent.findMany({
      where: {
        connectorId: connector.id,
        ...(cursorEvent
          ? {
              OR: [
                { occurredAt: { gt: cursorEvent.occurredAt } },
                {
                  occurredAt: cursorEvent.occurredAt,
                  id: { gt: cursorEvent.id }
                }
              ]
            }
          : {})
      },
      orderBy: [{ occurredAt: "asc" }, { id: "asc" }],
      take: limit + 1
    });
    const hasMore = events.length > limit;
    const page = events.slice(0, limit);
    return {
      events: page.map((event) => this.toEvent(event)),
      nextCursor: page.length ? page[page.length - 1].id : cursor ?? null,
      hasMore
    };
  }

  async authenticateConnectorToken(token: string) {
    if (!token) {
      throw new UnauthorizedException("Agent connector token is required");
    }

    const connector = await this.prisma.agentConnector.findUnique({
      where: { tokenHash: this.hashSecret(token) }
    });

    if (!connector || connector.status === AgentConnectorStatus.revoked) {
      throw new UnauthorizedException("Invalid agent connector token");
    }

    if (
      connector.status === AgentConnectorStatus.online &&
      connector.lastSeenAt.getTime() <= Date.now() - CONNECTOR_STALE_AFTER_MS
    ) {
      return this.prisma.agentConnector.update({
        where: { id: connector.id },
        data: { status: AgentConnectorStatus.offline }
      });
    }

    return connector;
  }

  private async persistEvents(
    connector: { id: string; studentId: string },
    inputs: Array<EventInput & { eventId: string; occurredAt: string }>
  ) {
    const dayIds = [...new Set(inputs.map((input) => input.dayId))];
    const days = await this.prisma.questDay.findMany({
      where: { id: { in: dayIds } },
      select: { id: true }
    });
    if (days.length !== dayIds.length) {
      throw new BadRequestException("One or more dayId values do not exist");
    }

    const events = await this.prisma.$transaction(async (tx) => {
      const persisted = [];
      for (const input of inputs) {
        const event = await tx.agentEvent.upsert({
          where: { eventId: input.eventId },
          update: {},
          create: {
            eventId: input.eventId,
            connectorId: connector.id,
            studentId: connector.studentId,
            dayId: input.dayId,
            type: input.type,
            payload: input.payload as Prisma.InputJsonValue,
            occurredAt: new Date(input.occurredAt)
          }
        });
        if (event.connectorId !== connector.id) {
          throw new ConflictException("eventId is already owned by another connector");
        }
        persisted.push(event);
      }
      await tx.agentConnector.update({
        where: { id: connector.id },
        data: {
          status: AgentConnectorStatus.online,
          lastSeenAt: new Date()
        }
      });
      return persisted;
    });

    return events.map((event) => this.toEvent(event));
  }

  private markStaleConnectorsOffline() {
    return this.prisma.agentConnector.updateMany({
      where: {
        status: AgentConnectorStatus.online,
        lastSeenAt: { lte: new Date(Date.now() - CONNECTOR_STALE_AFTER_MS) }
      },
      data: { status: AgentConnectorStatus.offline }
    });
  }

  private parseCursorLimit(rawLimit?: string | number) {
    if (rawLimit === undefined || rawLimit === "") return 50;
    const limit = Number(rawLimit);
    if (!Number.isInteger(limit) || limit < 1 || limit > 200) {
      throw new BadRequestException("limit must be an integer between 1 and 200");
    }
    return limit;
  }

  private toProfile(connector: {
    id: string;
    agentSessionId: string;
    provider: string;
    clientName: string;
    status: AgentConnectorStatus;
    capabilities: Prisma.JsonValue;
    connectedAt: Date;
    lastSeenAt: Date;
  }, roleKey?: string | null) {
    return {
      connectorId: connector.id,
      agentSessionId: connector.agentSessionId,
      provider: connector.provider,
      clientName: connector.clientName,
      status: connector.status,
      capabilities: this.toStringArray(connector.capabilities),
      roleKey: roleKey ?? null,
      visualRole: roleKey ? resolveAgentVisualRole(roleKey) : null,
      connectedAt: connector.connectedAt.toISOString(),
      lastSeenAt: connector.lastSeenAt.toISOString()
    };
  }

  private toEvent(event: {
    id: string;
    eventId: string;
    connectorId: string;
    studentId: string;
    dayId: string;
    type: string;
    payload: Prisma.JsonValue;
    occurredAt: Date;
    createdAt: Date;
  }) {
    return {
      id: event.id,
      eventId: event.eventId,
      connectorId: event.connectorId,
      studentId: event.studentId,
      dayId: event.dayId,
      type: event.type,
      payload: event.payload,
      occurredAt: event.occurredAt.toISOString(),
      createdAt: event.createdAt.toISOString()
    };
  }

  private toStringArray(value: Prisma.JsonValue) {
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
  }

  private hashSecret(value: string) {
    return crypto.createHash("sha256").update(value).digest("hex");
  }

  private createConnectionCredential(payload: ConnectionCredentialPayload) {
    const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
    return `${CREDENTIAL_PREFIX}.${encodedPayload}.${this.signCredential(encodedPayload)}`;
  }

  private parseConnectionCredential(value: string): ConnectionCredentialPayload {
    const [prefix, encodedPayload, signature, ...rest] = value.split(".");
    if (
      prefix !== CREDENTIAL_PREFIX ||
      !encodedPayload ||
      !signature ||
      rest.length > 0 ||
      !this.isValidSignature(encodedPayload, signature)
    ) {
      throw new BadRequestException("Connection credential is invalid or expired");
    }

    let payload: unknown;
    try {
      payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"));
    } catch {
      throw new BadRequestException("Connection credential is invalid or expired");
    }

    if (
      !payload ||
      typeof payload !== "object" ||
      (payload as ConnectionCredentialPayload).version !== 1 ||
      typeof (payload as ConnectionCredentialPayload).serverUrl !== "string" ||
      typeof (payload as ConnectionCredentialPayload).studentId !== "string" ||
      typeof (payload as ConnectionCredentialPayload).pairingSecret !== "string" ||
      typeof (payload as ConnectionCredentialPayload).expiresAt !== "string"
    ) {
      throw new BadRequestException("Connection credential is invalid or expired");
    }

    const credential = payload as ConnectionCredentialPayload;
    this.normalizeServerUrl(credential.serverUrl);
    if (Number.isNaN(new Date(credential.expiresAt).getTime())) {
      throw new BadRequestException("Connection credential is invalid or expired");
    }
    return credential;
  }

  private normalizeServerUrl(value: string) {
    try {
      const url = new URL(value);
      if (
        (url.protocol !== "http:" && url.protocol !== "https:") ||
        url.username ||
        url.password ||
        url.pathname !== "/" ||
        url.search ||
        url.hash
      ) {
        throw new Error("Invalid server URL");
      }
      return url.origin;
    } catch {
      throw new BadRequestException("Connection credential contains an invalid server URL");
    }
  }

  private signCredential(encodedPayload: string) {
    return crypto
      .createHmac("sha256", this.credentialSigningSecret())
      .update(encodedPayload)
      .digest("base64url");
  }

  private isValidSignature(encodedPayload: string, signature: string) {
    const expected = Buffer.from(this.signCredential(encodedPayload));
    const received = Buffer.from(signature);
    return expected.length === received.length && crypto.timingSafeEqual(expected, received);
  }

  private credentialSigningSecret() {
    if (process.env.CONNECTOR_CREDENTIAL_SIGNING_SECRET) {
      return process.env.CONNECTOR_CREDENTIAL_SIGNING_SECRET;
    }
    if (process.env.NODE_ENV === "production") {
      throw new BadRequestException("CONNECTOR_CREDENTIAL_SIGNING_SECRET is required in production");
    }
    return DEVELOPMENT_CREDENTIAL_SIGNING_SECRET;
  }
}
