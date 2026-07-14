import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import type { AuthService } from "./auth.service";

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext) => {
    const request = context.switchToHttp().getRequest<{
      authSession?: Awaited<ReturnType<AuthService["getSession"]>>;
    }>();

    return request.authSession?.user;
  }
);
