import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  Inject,
  Post,
  Query,
  Req,
  UseGuards
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsISO8601,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested
} from "class-validator";
import { networkInterfaces } from "node:os";
import { UserRole } from "@prisma/client";
import { AuthGuard } from "../auth/auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import { AgentConnectorsService } from "./agent-connectors.service";
import { INITIAL_WORKSTATION_ROLE_KEYS } from "contracts";

class ConnectAgentDto {
  @IsString()
  @MinLength(40)
  connectionCredential!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  provider!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  clientName!: string;

  @IsArray()
  @IsString({ each: true })
  capabilities!: string[];

  @IsOptional()
  @IsIn(INITIAL_WORKSTATION_ROLE_KEYS)
  roleKey?: string;
}

class HeartbeatDto {
  @IsIn(["online", "offline"])
  status!: "online" | "offline";
}

class AgentEventDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  eventId?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  dayId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  type!: string;

  @IsObject()
  payload!: Record<string, unknown>;

  @IsOptional()
  @IsISO8601()
  occurredAt?: string;
}

class BatchAgentEventDto {
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  eventId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  dayId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  type!: string;

  @IsObject()
  payload!: Record<string, unknown>;

  @IsISO8601()
  occurredAt!: string;
}

class AgentEventBatchDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => BatchAgentEventDto)
  events!: BatchAgentEventDto[];
}

type SessionUser = {
  id: string;
  role: UserRole;
  displayName: string;
};

type ResolveConnectorPublicApiUrlInput = {
  configured?: string;
  protocol: string;
  host: string;
  localIpv4Addresses?: string[];
};

export function resolveConnectorPublicApiUrl(
  input: ResolveConnectorPublicApiUrlInput
) {
  if (input.configured) {
    return input.configured;
  }

  const url = new URL(`${input.protocol}://${input.host}`);
  if (!isLoopbackHostname(url.hostname)) {
    return url.origin;
  }

  const localAddress = (
    input.localIpv4Addresses ?? listLocalIpv4Addresses()
  ).find(isPrivateIpv4Address);
  if (localAddress) {
    url.hostname = localAddress;
  }
  return url.origin;
}

function listLocalIpv4Addresses() {
  return Object.values(networkInterfaces())
    .flatMap((addresses) => addresses ?? [])
    .filter((address) => address.family === "IPv4" && !address.internal)
    .map((address) => address.address);
}

function isLoopbackHostname(hostname: string) {
  return hostname === "localhost"
    || hostname === "127.0.0.1"
    || hostname === "::1"
    || hostname === "[::1]";
}

function isPrivateIpv4Address(address: string) {
  const octets = address.split(".").map(Number);
  if (octets.length !== 4 || octets.some((octet) => !Number.isInteger(octet))) {
    return false;
  }
  return octets[0] === 10
    || (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31)
    || (octets[0] === 192 && octets[1] === 168);
}

@ApiTags("agent-connectors")
@Controller("agent-connectors")
export class AgentConnectorsController {
  constructor(
    @Inject(AgentConnectorsService)
    private readonly agentConnectorsService: AgentConnectorsService
  ) {}

  @Post("pairing")
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  async createPairing(
    @CurrentUser() user: SessionUser,
    @Req() request: { protocol?: string; headers: Record<string, string | string[] | undefined> }
  ) {
    this.assertConnectorOwner(user);
    return this.agentConnectorsService.createPairing(
      user.id,
      this.resolvePublicApiUrl(request)
    );
  }

  @Post("connect")
  async connect(@Body() body: ConnectAgentDto) {
    return this.agentConnectorsService.connect(body);
  }

  @Get("me")
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  async getProfile(@CurrentUser() user: SessionUser) {
    this.assertConnectorOwner(user);
    return this.agentConnectorsService.getStudentProfile(user.id);
  }

  @Post("heartbeat")
  async heartbeat(
    @Headers("x-agent-connector-token") token: string,
    @Body() body: HeartbeatDto
  ) {
    return this.agentConnectorsService.heartbeat(token, body);
  }

  @Post("events")
  async recordEvent(
    @Headers("x-agent-connector-token") token: string,
    @Body() body: AgentEventDto
  ) {
    return this.agentConnectorsService.recordEvent(token, body);
  }

  @Post("events/batch")
  async recordEventBatch(
    @Headers("x-agent-connector-token") token: string,
    @Body() body: AgentEventBatchDto
  ) {
    return this.agentConnectorsService.recordEvents(token, body.events);
  }

  @Get("events/cursor")
  async listConnectorEvents(
    @Headers("x-agent-connector-token") token: string,
    @Query("cursor") cursor: string | undefined,
    @Query("limit") limit: string | undefined
  ) {
    return this.agentConnectorsService.listConnectorEvents(
      token,
      cursor,
      limit
    );
  }

  @Get("events")
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  async listEvents(
    @Query("dayId") dayId: string | undefined,
    @CurrentUser() user: SessionUser
  ) {
    this.assertConnectorOwner(user);
    return this.agentConnectorsService.listEvents(user.id, dayId);
  }

  private assertConnectorOwner(user: SessionUser) {
    if (user.role !== UserRole.student && user.role !== UserRole.teacher) {
      throw new ForbiddenException("Teacher or student access required");
    }
  }

  private resolvePublicApiUrl(request: {
    protocol?: string;
    headers: Record<string, string | string[] | undefined>;
  }) {
    const forwardedProtocol = this.firstHeader(request.headers["x-forwarded-proto"]);
    const protocol = forwardedProtocol ?? request.protocol ?? "http";
    const host = this.firstHeader(request.headers["x-forwarded-host"])
      ?? this.firstHeader(request.headers.host);
    if (!host) {
      throw new ForbiddenException("Connector public API URL is not configured");
    }
    return resolveConnectorPublicApiUrl({
      configured: process.env.CONNECTOR_PUBLIC_API_URL,
      protocol,
      host
    });
  }

  private firstHeader(value: string | string[] | undefined) {
    return Array.isArray(value) ? value[0] : value?.split(",")[0]?.trim();
  }
}
