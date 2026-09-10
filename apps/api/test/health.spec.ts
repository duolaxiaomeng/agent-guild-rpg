import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { PrismaClient } from "@prisma/client";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { HealthController } from "../src/health.controller";
import { ReviewQueueService } from "../src/modules/queue/review.queue";
import { PrismaService } from "../src/prisma/prisma.service";
import { prepareTestDatabase } from "./support/test-database";

describe("GET /health", () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  const previousRedisUrl = process.env.REDIS_URL;
  const previousQueueRequired = process.env.REVIEW_QUEUE_REQUIRED;

  beforeAll(async () => {
    delete process.env.REDIS_URL;
    delete process.env.REVIEW_QUEUE_REQUIRED;
    prisma = await prepareTestDatabase("health");
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        { provide: PrismaService, useValue: prisma },
        {
          provide: ReviewQueueService,
          useValue: { checkHealth: async () => "disabled" as const }
        }
      ]
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
    if (previousRedisUrl === undefined) delete process.env.REDIS_URL;
    else process.env.REDIS_URL = previousRedisUrl;
    if (previousQueueRequired === undefined) delete process.env.REVIEW_QUEUE_REQUIRED;
    else process.env.REVIEW_QUEUE_REQUIRED = previousQueueRequired;
  });

  it("returns ok", async () => {
    const response = await request(app.getHttpServer()).get("/health");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: "ok" });
  });

  it("reports database readiness", async () => {
    const response = await request(app.getHttpServer()).get("/health/ready");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      status: "ready",
      database: "up",
      schema: "up",
      redis: "disabled"
    });
  });
});
