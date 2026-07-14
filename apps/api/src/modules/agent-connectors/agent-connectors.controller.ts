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
import {
  IsArray,
  IsIn,
  IsISO8601,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  MinLength
} from "class-validator";
import { UserRole } from "@prisma/client";
import { AuthGuard } from "../auth/auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import { AgentConnectorsService } from "./agent-connectors.service";

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
}

class HeartbeatDto {
  @IsIn(["online", "offline"])
  status!: "online" | "offline";
}

class AgentEventDto {
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

type SessionUser = {
  id: string;
  role: UserRole;
  displayName: string;
};

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
    const configured = process.env.CONNECTOR_PUBLIC_API_URL;
    if (configured) {
      return configured;
    }

    const forwardedProtocol = this.firstHeader(request.headers["x-forwarded-proto"]);
    const protocol = forwardedProtocol ?? request.protocol ?? "http";
    const host = this.firstHeader(request.headers["x-forwarded-host"])
      ?? this.firstHeader(request.headers.host);
    if (!host) {
      throw new ForbiddenException("Connector public API URL is not configured");
    }
    return `${protocol}://${host}`;
  }

  private firstHeader(value: string | string[] | undefined) {
    return Array.isArray(value) ? value[0] : value?.split(",")[0]?.trim();
  }
}
