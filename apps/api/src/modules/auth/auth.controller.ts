import { Body, Controller, Get, Headers, Inject, Post } from "@nestjs/common";
import { AuthService } from "./auth.service";

@Controller("auth")
export class AuthController {
  constructor(@Inject(AuthService) private readonly authService: AuthService) {}

  @Post("login")
  login(@Body() body: { email: string; password: string }) {
    return this.authService.login(body.email, body.password);
  }

  @Get("session")
  getSession(@Headers("authorization") authorization?: string) {
    const token = authorization?.replace(/^Bearer\s+/i, "") ?? "";
    return this.authService.getSession(token);
  }
}
