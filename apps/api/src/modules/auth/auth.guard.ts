import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException
} from "@nestjs/common";
import { AuthService } from "./auth.service";

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(@Inject(AuthService) private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<{
      headers?: Record<string, string | string[] | undefined>;
      authSession?: Awaited<ReturnType<AuthService["getSession"]>>;
    }>();
    const authorization = request.headers?.authorization;
    const bearerToken =
      typeof authorization === "string"
        ? authorization.replace(/^Bearer\s+/i, "").trim()
        : "";
    const cookieHeader = request.headers?.cookie;
    const cookieToken = typeof cookieHeader === "string"
      ? cookieHeader.match(/(?:^|;\s*)agent-guild-session-token=([^;]+)/)?.[1] ?? ""
      : "";
    const token = bearerToken || decodeURIComponent(cookieToken);

    if (!token) {
      throw new UnauthorizedException("Invalid session");
    }

    request.authSession = await this.authService.getSession(token);
    return true;
  }
}
