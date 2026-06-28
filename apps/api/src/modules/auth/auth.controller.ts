import { Body, Controller, Post } from "@nestjs/common";

@Controller("auth")
export class AuthController {
  @Post("login")
  login(@Body() body: { email: string }) {
    return {
      token: "dev-token",
      user: {
        id: "11111111-1111-4111-8111-111111111111",
        role: body.email.includes("teacher") ? "teacher" : "student",
        displayName: body.email.split("@")[0]
      }
    };
  }
}
