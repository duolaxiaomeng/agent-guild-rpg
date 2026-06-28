import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { PrismaClient } from "@prisma/client";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";
import { prepareTestDatabase } from "./support/test-database";

describe("auth flow", () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = await prepareTestDatabase("auth-flow");

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule]
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }

    if (prisma) {
      await prisma.$disconnect();
    }
  });

  it("logs in a seeded teacher and returns a session token", async () => {
    const response = await request(app.getHttpServer()).post("/auth/login").send({
      email: "teacher@academy.test",
      password: "teacher-pass-123"
    });

    expect(response.status).toBe(201);
    expect(response.body.user.role).toBe("teacher");
    expect(response.body.token).toMatch(/^session_/);
  });
});
