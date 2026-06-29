import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { PrismaClient } from "@prisma/client";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { seedDatabase } from "../prisma/seed";
import { AppModule } from "../src/app.module";
import { prepareTestDatabase } from "./support/test-database";

describe("room access", () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = await prepareTestDatabase("room-access");

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule]
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  beforeEach(async () => {
    await seedDatabase(prisma);
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }

    if (prisma) {
      await prisma.$disconnect();
    }
  });

  it("creates and lists room access grants with display names and status", async () => {
    const firstGrantResponse = await request(app.getHttpServer())
      .post("/rooms/access-grants")
      .send({
        roomId: "room-chat-student-1",
        granteeId: "student-2",
        scope: "chat_summary",
        expiresInHours: 24
      });
    const secondGrantResponse = await request(app.getHttpServer())
      .post("/rooms/access-grants")
      .send({
        roomId: "room-chat-student-1",
        granteeId: "student-3",
        scope: "chat_summary",
        expiresInHours: 24
      });

    const listResponse = await request(app.getHttpServer()).get(
      "/rooms/access-grants?roomId=room-chat-student-1"
    );

    expect(firstGrantResponse.status).toBe(201);
    expect(secondGrantResponse.status).toBe(201);
    expect(listResponse.status).toBe(200);
    expect(listResponse.body).toEqual([
      {
        id: secondGrantResponse.body.id,
        roomId: "room-chat-student-1",
        granteeId: "student-3",
        granteeName: "Kai",
        scope: "chat_summary",
        status: "approved",
        createdAt: expect.any(String),
        expiresAt: expect.any(String)
      },
      {
        id: firstGrantResponse.body.id,
        roomId: "room-chat-student-1",
        granteeId: "student-2",
        granteeName: "Mo",
        scope: "chat_summary",
        status: "approved",
        createdAt: expect.any(String),
        expiresAt: expect.any(String)
      }
    ]);
  });

  it("soft revokes a room access grant and keeps it in the full history list", async () => {
    const createResponse = await request(app.getHttpServer())
      .post("/rooms/access-grants")
      .send({
        roomId: "room-chat-student-1",
        granteeId: "student-2",
        scope: "chat_summary",
        expiresInHours: 24
      });

    const revokeResponse = await request(app.getHttpServer()).post(
      `/rooms/access-grants/${createResponse.body.id}/revoke`
    );
    const listResponse = await request(app.getHttpServer()).get(
      "/rooms/access-grants?roomId=room-chat-student-1"
    );

    expect(revokeResponse.status).toBe(201);
    expect(revokeResponse.body).toEqual({
      id: createResponse.body.id,
      roomId: "room-chat-student-1",
      granteeId: "student-2",
      granteeName: "Mo",
      scope: "chat_summary",
      status: "revoked",
      createdAt: expect.any(String),
      expiresAt: expect.any(String)
    });
    expect(listResponse.status).toBe(200);
    expect(listResponse.body).toEqual([
      {
        id: createResponse.body.id,
        roomId: "room-chat-student-1",
        granteeId: "student-2",
        granteeName: "Mo",
        scope: "chat_summary",
        status: "revoked",
        createdAt: expect.any(String),
        expiresAt: expect.any(String)
      }
    ]);
  });
});
