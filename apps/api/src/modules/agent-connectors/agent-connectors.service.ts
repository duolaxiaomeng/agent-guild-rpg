import {
  BadRequestException,
  Inject,
  Injectable,
  UnauthorizedException
} from "@nestjs/common";
import { AgentConnectorStatus, Prisma } from "@prisma/client";
import * as crypto from "crypto";
import { PrismaService } from "../../prisma/prisma.service";

const PAIRING_TTL_MS = 10 * 60 * 1000;
const CREDENTIAL_PREFIX = "agc1";
const DEVELOPMENT_CREDENTIAL_SIGNING_SECRET = "agent-guild-development-connector-credential-secret";

type ConnectorInput = {
  connectionCredential: string;
  provider: string;
  clientName: string;
  capabilities: string[];
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

    const connector = await this.prisma.$transaction(async (tx) => {
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

      return created;
    });

    return {
      connectorId: connector.id,
      agentSessionId: connector.agentSessionId,
      connectorToken,
      provider: connector.provider,
      clientName: connector.clientName,
      status: connector.status,
      capabilities: this.toStringArray(connector.capabilities),
      connectedAt: connector.connectedAt.toISOString(),
      lastSeenAt: connector.lastSeenAt.toISOString()
    };
  }

  async getStudentProfile(studentId: string) {
    const connector = await this.prisma.agentConnector.findFirst({
      where: { studentId, status: { not: AgentConnectorStatus.revoked } },
      orderBy: { lastSeenAt: "desc" }
    });

    return connector ? this.toProfile(connector) : null;
  }

  async heartbeat(token: string, input: HeartbeatInput) {
    const connector = await this.findByToken(token);
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
    const connector = await this.findByToken(token);
    const day = await this.prisma.questDay.findUnique({
      where: { id: input.dayId },
      select: { id: true }
    });

    if (!day) {
      throw new BadRequestException("dayId does not exist");
    }

    const event = await this.prisma.agentEvent.create({
      data: {
        connectorId: connector.id,
        studentId: connector.studentId,
        dayId: input.dayId,
        type: input.type,
        payload: input.payload as Prisma.InputJsonValue,
        occurredAt: input.occurredAt ? new Date(input.occurredAt) : new Date()
      }
    });

    await this.prisma.agentConnector.update({
      where: { id: connector.id },
      data: {
        status: AgentConnectorStatus.online,
        lastSeenAt: new Date()
      }
    });

    return this.toEvent(event);
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

  private async findByToken(token: string) {
    if (!token) {
      throw new UnauthorizedException("Agent connector token is required");
    }

    const connector = await this.prisma.agentConnector.findUnique({
      where: { tokenHash: this.hashSecret(token) }
    });

    if (!connector || connector.status === AgentConnectorStatus.revoked) {
      throw new UnauthorizedException("Invalid agent connector token");
    }

    return connector;
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
  }) {
    return {
      connectorId: connector.id,
      agentSessionId: connector.agentSessionId,
      provider: connector.provider,
      clientName: connector.clientName,
      status: connector.status,
      capabilities: this.toStringArray(connector.capabilities),
      connectedAt: connector.connectedAt.toISOString(),
      lastSeenAt: connector.lastSeenAt.toISOString()
    };
  }

  private toEvent(event: {
    id: string;
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
