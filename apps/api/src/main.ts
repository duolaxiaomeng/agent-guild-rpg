import "reflect-metadata";
import os from "node:os";
import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { AppModule } from "./app.module";
import { PrismaExceptionFilter } from "./prisma-exception.filter";

function validateProductionEnvironment() {
  if (process.env.NODE_ENV !== "production") return;

  const required = [
    "DATABASE_URL",
    "ALLOWED_ORIGINS",
    "CONNECTOR_PUBLIC_API_URL",
    "CONNECTOR_CREDENTIAL_SIGNING_SECRET",
    "REGISTRATION_INTERNAL_CODE"
  ];
  const missing = required.filter((name) => !process.env[name]?.trim());
  if (missing.length > 0) {
    throw new Error(`Missing required production environment variables: ${missing.join(", ")}`);
  }
}

function getDevelopmentAllowedOrigins() {
  const origins = new Set(["http://localhost:3000", "http://localhost:3100"]);
  for (const interfaces of Object.values(os.networkInterfaces())) {
    for (const address of interfaces ?? []) {
      if (address.family === "IPv4" && !address.internal) {
        origins.add(`http://${address.address}:3000`);
        origins.add(`http://${address.address}:3100`);
      }
    }
  }
  return [...origins];
}

async function bootstrap() {
  validateProductionEnvironment();
  const app = await NestFactory.create(AppModule);

  // R-012: Configure CORS with whitelist instead of allowing all origins
  const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(",").map((s) => s.trim())
    : getDevelopmentAllowedOrigins();

  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true
    })
  );
  app.useGlobalFilters(new PrismaExceptionFilter());

  // R-028: Disable Swagger UI in production to prevent unauthenticated access
  if (process.env.NODE_ENV !== "production") {
    const config = new DocumentBuilder()
      .setTitle("Agent Guild API")
      .setDescription("游戏化教学平台 API — 供 AI Agent 和开发者调用")
      .setVersion("1.0")
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup("api-docs", app, document);
  }

  // Keep the development default stable while allowing Playwright/CI to run
  // an isolated API instance alongside a developer's API on port 3001.
  const port = Number(process.env.PORT ?? 3001);
  await app.listen(port, "0.0.0.0");
}

void bootstrap();
