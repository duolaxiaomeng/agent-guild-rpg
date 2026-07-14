import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { PrismaClient } from "@prisma/client";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";
import { prepareTestDatabase } from "./support/test-database";

describe("local agent connector flow", () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  async function loginAsStudent() {
    const response = await request(app.getHttpServer())
      .post("/auth/login")
      .send({
        email: "lin@academy.test",
        password: "student-pass-123"
      });

    expect(response.status).toBe(201);
    return response.body.token as string;
  }

  async function loginAsTeacher() {
    const response = await request(app.getHttpServer())
      .post("/auth/login")
      .send({
        email: "teacher@academy.test",
        password: "teacher-pass-123"
      });

    expect(response.status).toBe(201);
    return response.body.token as string;
  }

  async function pairConnector() {
    const studentToken = await loginAsStudent();
    const pairingResponse = await request(app.getHttpServer())
      .post("/agent-connectors/pairing")
      .set("Authorization", `Bearer ${studentToken}`);

    expect(pairingResponse.status).toBe(201);

    const connectResponse = await request(app.getHttpServer())
      .post("/agent-connectors/connect")
      .send({
        connectionCredential: pairingResponse.body.connectionCredential,
        provider: "codex-cli",
        clientName: "lin-mac",
        capabilities: ["filesystem.read", "terminal.run", "events"]
      });

    expect(connectResponse.status).toBe(201);
    return {
      studentToken,
      connectorToken: connectResponse.body.connectorToken as string,
      connectorId: connectResponse.body.connectorId as string
    };
  }

  beforeAll(async () => {
    prisma = await prepareTestDatabase("agent-connector");

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule]
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  it("issues one credential that connects a student's local connector", async () => {
    const studentToken = await loginAsStudent();
    const pairingResponse = await request(app.getHttpServer())
      .post("/agent-connectors/pairing")
      .set("Authorization", `Bearer ${studentToken}`);

    expect(pairingResponse.status).toBe(201);
    expect(pairingResponse.body.connectionCredential).toMatch(/^agc1\./);

    const connectResponse = await request(app.getHttpServer())
      .post("/agent-connectors/connect")
      .send({
        connectionCredential: pairingResponse.body.connectionCredential,
        provider: "codex-cli",
        clientName: "lin-mac",
        capabilities: ["filesystem.read", "terminal.run", "events"]
      });

    expect(connectResponse.status).toBe(201);
    expect(connectResponse.body).toMatchObject({
      provider: "codex-cli",
      clientName: "lin-mac",
      status: "online"
    });
    expect(connectResponse.body.connectorToken).toEqual(expect.any(String));

    const profileResponse = await request(app.getHttpServer())
      .get("/agent-connectors/me")
      .set("Authorization", `Bearer ${studentToken}`);

    expect(profileResponse.status).toBe(200);
    expect(profileResponse.body).toMatchObject({
      provider: "codex-cli",
      status: "online",
      capabilities: ["filesystem.read", "terminal.run", "events"]
    });
    expect(profileResponse.body.connectorToken).toBeUndefined();
  });

  it("refreshes connector presence and records a Day event", async () => {
    const { studentToken, connectorToken, connectorId } = await pairConnector();

    const heartbeatResponse = await request(app.getHttpServer())
      .post("/agent-connectors/heartbeat")
      .set("X-Agent-Connector-Token", connectorToken)
      .send({ status: "online" });

    expect(heartbeatResponse.status).toBe(201);
    expect(heartbeatResponse.body).toMatchObject({
      connectorId,
      status: "online"
    });

    const eventResponse = await request(app.getHttpServer())
      .post("/agent-connectors/events")
      .set("X-Agent-Connector-Token", connectorToken)
      .send({
        dayId: "day-1",
        type: "run.started",
        payload: { instruction: "Inspect the starter project" },
        occurredAt: "2026-07-12T04:00:00.000Z"
      });

    expect(eventResponse.status).toBe(201);
    expect(eventResponse.body).toMatchObject({
      connectorId,
      dayId: "day-1",
      type: "run.started",
      payload: { instruction: "Inspect the starter project" }
    });

    const timelineResponse = await request(app.getHttpServer())
      .get("/agent-connectors/events?dayId=day-1")
      .set("Authorization", `Bearer ${studentToken}`);

    expect(timelineResponse.status).toBe(200);
    expect(timelineResponse.body).toHaveLength(1);
    expect(timelineResponse.body[0]).toMatchObject({
      connectorId,
      type: "run.started",
      dayId: "day-1"
    });
  });

  it("does not allow a connector credential to be reused", async () => {
    const studentToken = await loginAsStudent();
    const pairingResponse = await request(app.getHttpServer())
      .post("/agent-connectors/pairing")
      .set("Authorization", `Bearer ${studentToken}`);

    const payload = {
      connectionCredential: pairingResponse.body.connectionCredential,
      provider: "codex-cli",
      clientName: "lin-mac",
      capabilities: ["events"]
    };

    const firstConnect = await request(app.getHttpServer())
      .post("/agent-connectors/connect")
      .send(payload);
    const secondConnect = await request(app.getHttpServer())
      .post("/agent-connectors/connect")
      .send(payload);

    expect(firstConnect.status).toBe(201);
    expect(secondConnect.status).toBe(400);
  });

  it("lets a teacher bind and inspect their own local connector", async () => {
    const teacherToken = await loginAsTeacher();
    const pairingResponse = await request(app.getHttpServer())
      .post("/agent-connectors/pairing")
      .set("Authorization", `Bearer ${teacherToken}`);

    expect(pairingResponse.status).toBe(201);

    const connectResponse = await request(app.getHttpServer())
      .post("/agent-connectors/connect")
      .send({
        connectionCredential: pairingResponse.body.connectionCredential,
        provider: "codex-cli",
        clientName: "teacher-mac",
        capabilities: ["filesystem.read", "events"]
      });

    expect(connectResponse.status).toBe(201);

    const eventResponse = await request(app.getHttpServer())
      .post("/agent-connectors/events")
      .set("X-Agent-Connector-Token", connectResponse.body.connectorToken)
      .send({
        dayId: "day-1",
        type: "teacher.assignment.started",
        payload: { instruction: "Prepare today's homework" }
      });

    expect(eventResponse.status).toBe(201);
    expect(eventResponse.body.studentId).toBe("teacher-1");

    const [profileResponse, eventsResponse] = await Promise.all([
      request(app.getHttpServer())
        .get("/agent-connectors/me")
        .set("Authorization", `Bearer ${teacherToken}`),
      request(app.getHttpServer())
        .get("/agent-connectors/events?dayId=day-1")
        .set("Authorization", `Bearer ${teacherToken}`)
    ]);

    expect(profileResponse.status).toBe(200);
    expect(profileResponse.body).toMatchObject({
      provider: "codex-cli",
      clientName: "teacher-mac"
    });
    expect(eventsResponse.status).toBe(200);
    expect(eventsResponse.body).toHaveLength(1);
    expect(eventsResponse.body[0]).toMatchObject({
      studentId: "teacher-1",
      type: "teacher.assignment.started"
    });
  });

  it("keeps pairing, profile, and event history behind session auth", async () => {
    const [pairingResponse, profileResponse, eventsResponse] = await Promise.all([
      request(app.getHttpServer()).post("/agent-connectors/pairing"),
      request(app.getHttpServer()).get("/agent-connectors/me"),
      request(app.getHttpServer()).get("/agent-connectors/events")
    ]);

    expect(pairingResponse.status).toBe(401);
    expect(profileResponse.status).toBe(401);
    expect(eventsResponse.status).toBe(401);
  });
});
