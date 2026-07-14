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

  async function loginAs(email: string, password: string) {
    const response = await request(app.getHttpServer()).post("/auth/login").send({
      email,
      password
    });

    expect(response.status).toBe(201);
    return response.body.token as string;
  }

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
    // Grant-history tests create the complete fixture themselves; remove the
    // seed's collaboration grants so list and accessible-room counts are
    // deterministic.
    await prisma.roomAccessGrant.deleteMany();
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
    const ownerToken = await loginAs("lin@academy.test", "student-pass-123");
    const firstGrantResponse = await request(app.getHttpServer())
      .post("/rooms/access-grants")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({
        roomId: "room-chat-student-1",
        granteeId: "student-2",
        scope: "chat_summary",
        expiresInHours: 24
      });
    const secondGrantResponse = await request(app.getHttpServer())
      .post("/rooms/access-grants")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({
        roomId: "room-chat-student-1",
        granteeId: "student-3",
        scope: "chat_summary",
        expiresInHours: 24
      });

    const listResponse = await request(app.getHttpServer())
      .get("/rooms/access-grants?roomId=room-chat-student-1")
      .set("Authorization", `Bearer ${ownerToken}`);

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
    const ownerToken = await loginAs("lin@academy.test", "student-pass-123");
    const createResponse = await request(app.getHttpServer())
      .post("/rooms/access-grants")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({
        roomId: "room-chat-student-1",
        granteeId: "student-2",
        scope: "chat_summary",
        expiresInHours: 24
      });

    const revokeResponse = await request(app.getHttpServer())
      .post(`/rooms/access-grants/${createResponse.body.id}/revoke`)
      .set("Authorization", `Bearer ${ownerToken}`);
    const listResponse = await request(app.getHttpServer())
      .get("/rooms/access-grants?roomId=room-chat-student-1")
      .set("Authorization", `Bearer ${ownerToken}`);

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

  it("rejects non-owners from reading or mutating another student's room grants", async () => {
    const ownerToken = await loginAs("lin@academy.test", "student-pass-123");
    const outsiderToken = await loginAs("mo@academy.test", "student-pass-456");

    const createResponse = await request(app.getHttpServer())
      .post("/rooms/access-grants")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({
        roomId: "room-chat-student-1",
        granteeId: "student-2",
        scope: "chat_summary",
        expiresInHours: 24
      });

    const listResponse = await request(app.getHttpServer())
      .get("/rooms/access-grants?roomId=room-chat-student-1")
      .set("Authorization", `Bearer ${outsiderToken}`);
    const createAsOutsiderResponse = await request(app.getHttpServer())
      .post("/rooms/access-grants")
      .set("Authorization", `Bearer ${outsiderToken}`)
      .send({
        roomId: "room-chat-student-1",
        granteeId: "student-3",
        scope: "chat_summary",
        expiresInHours: 24
      });
    const revokeResponse = await request(app.getHttpServer())
      .post(`/rooms/access-grants/${createResponse.body.id}/revoke`)
      .set("Authorization", `Bearer ${outsiderToken}`);

    expect(listResponse.status).toBe(403);
    expect(createAsOutsiderResponse.status).toBe(403);
    expect(revokeResponse.status).toBe(403);
  });

  it("lists only approved and unexpired rooms a student can access", async () => {
    const ownerToken = await loginAs("lin@academy.test", "student-pass-123");

    await request(app.getHttpServer())
      .post("/rooms/access-grants")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({
        roomId: "room-chat-student-1",
        granteeId: "student-2",
        scope: "chat_summary",
        expiresInHours: 24
      });

    const revokedGrantResponse = await request(app.getHttpServer())
      .post("/rooms/access-grants")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({
        roomId: "room-chat-student-1",
        granteeId: "student-2",
        scope: "chat_summary",
        expiresInHours: 24
      });
    await request(app.getHttpServer())
      .post(`/rooms/access-grants/${revokedGrantResponse.body.id}/revoke`)
      .set("Authorization", `Bearer ${ownerToken}`);

    await prisma.roomAccessGrant.create({
      data: {
        roomId: "room-chat-student-1",
        granteeId: "student-2",
        scope: "chat_summary",
        status: "approved",
        expiresAt: new Date(Date.now() - 60 * 60 * 1000),
        createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000)
      }
    });

    const studentToken = await loginAs("mo@academy.test", "student-pass-456");
    const response = await request(app.getHttpServer())
      .get("/rooms/accessible-rooms")
      .set("Authorization", `Bearer ${studentToken}`);

    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(1);
    expect(response.body[0]).toEqual({
      roomId: "room-chat-student-1",
      ownerId: "student-1",
      ownerName: "Lin",
      scope: "chat_summary",
      expiresAt: expect.any(String),
      createdAt: expect.any(String)
    });
  });

  it("does not expose accessible rooms to teachers", async () => {
    const teacherToken = await loginAs("teacher@academy.test", "teacher-pass-123");

    const response = await request(app.getHttpServer())
      .get("/rooms/accessible-rooms")
      .set("Authorization", `Bearer ${teacherToken}`);

    expect(response.status).toBe(403);
  });
});
