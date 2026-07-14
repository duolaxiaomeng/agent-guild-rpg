import {
  Body,
  Controller,
  Get,
  Inject,
  Post,
  Req,
  UseGuards
} from "@nestjs/common";
import { IsEmail, IsString, Length, MaxLength, MinLength } from "class-validator";
import { Throttle, ThrottlerGuard } from "@nestjs/throttler";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { UserRole } from "@prisma/client";
import { AuthService } from "./auth.service";
import { AuthGuard } from "./auth.guard";

class LoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  password!: string;
}

class RegisterDto {
  @IsString()
  @Length(2, 40)
  displayName!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password!: string;

  @IsString()
  @MinLength(1)
  registrationCode!: string;
}

type AuthSessionData = {
  token: string;
  user: {
    id: string;
    role: UserRole;
    displayName: string;
  };
};

@ApiTags("auth")
@Controller("auth")
export class AuthController {
  constructor(
    @Inject(AuthService) private readonly authService: AuthService,
  ) {}

  @ApiOperation({ summary: "用户登录", description: "使用邮箱和密码登录，返回 token 和用户信息" })
  // R-007: IP-level rate limit on login — 10 requests per minute
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post("login")
  login(@Body() body: LoginDto) {
    return this.authService.login(body.email, body.password);
  }

  @ApiOperation({ summary: "学生注册", description: "验证内部注册码后创建学生账号并返回登录会话" })
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post("register")
  register(@Body() body: RegisterDto) {
    return this.authService.register(body);
  }

  @ApiOperation({ summary: "获取当前会话", description: "通过 Bearer token 获取当前登录用户信息" })
  // A-019: Use AuthGuard + request authSession instead of manual header parsing
  @UseGuards(AuthGuard)
  @Get("session")
  getSession(@Req() req: { authSession?: AuthSessionData }) {
    return req.authSession;
  }

  @ApiOperation({ summary: "退出登录", description: "仅清除当前 token 对应的会话记录" })
  // R-011: Only delete the current token's session, not all user sessions
  @UseGuards(AuthGuard)
  @Post("logout")
  async logout(@Req() req: { authSession?: { token: string } }) {
    if (req.authSession?.token) {
      await this.authService.logout(req.authSession.token);
    }
    return { success: true };
  }
}
