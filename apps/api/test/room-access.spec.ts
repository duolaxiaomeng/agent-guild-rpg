import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { PrismaClient } from "@prisma/client";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
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

  afterAll(async () => {
    if (app) {
      await app.close();
    }

    if (prisma) {
      await prisma.$disconnect();
    }
  });

  it("creates and lists room access grants for a homestead chat room", async () => {
    const createResponse = await request(app.getHttpServer())
      .post("/rooms/access-grants")
      .send({
        roomId: "room-chat-1",
        granteeId: "student-2",
        scope: "chat_summary",
        expiresInHours: 24
      });

    const listResponse = await request(app.getHttpServer()).get(
      "/rooms/access-grants?roomId=room-chat-1"
    );

    expect(createResponse.status).toBe(201);
    expect(listResponse.status).toBe(200);
    expect(listResponse.body[0].roomId).toBe("room-chat-1");
    expect(listResponse.body[0].granteeId).toBe("student-2");
  });
});
