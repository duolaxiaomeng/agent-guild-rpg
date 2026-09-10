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

  it("binds a model-selected role and initializes the private workstation", async () => {
    const studentToken = await loginAsStudent();
    const pairingResponse = await request(app.getHttpServer())
      .post("/agent-connectors/pairing")
      .set("Authorization", `Bearer ${studentToken}`);

    const connectResponse = await request(app.getHttpServer())
      .post("/agent-connectors/connect")
      .send({
        connectionCredential: pairingResponse.body.connectionCredential,
        provider: "codex-cli",
        clientName: "role-selecting-agent",
        capabilities: ["events", "agent-task", "provider-process"],
        roleKey: "frontend-developer",
      });

    expect(connectResponse.status).toBe(201);
    expect(connectResponse.body).toMatchObject({
      roleKey: "frontend-developer",
      visualRole: "coder",
    });
    await expect(
      prisma.agentTeamBinding.findUnique({ where: { studentId: "student-1" } }),
    ).resolves.toMatchObject({ roleKey: "frontend-developer" });
    await expect(
      prisma.agentWorldState.findUnique({ where: { studentId: "student-1" } }),
    ).resolves.toMatchObject({
      currentZone: "workstations",
      positionX: 316,
      positionY: 214,
      facing: "left",
    });
  });

  it("keeps legacy connectors compatible when no role is declared", async () => {
    await prisma.agentWorldState.deleteMany({ where: { studentId: "student-1" } });
    await prisma.agentTeamBinding.deleteMany({ where: { studentId: "student-1" } });
    const studentToken = await loginAsStudent();
    const pairingResponse = await request(app.getHttpServer())
      .post("/agent-connectors/pairing")
      .set("Authorization", `Bearer ${studentToken}`);

    const connectResponse = await request(app.getHttpServer())
      .post("/agent-connectors/connect")
      .send({
        connectionCredential: pairingResponse.body.connectionCredential,
        provider: "legacy-cli",
        clientName: "legacy-agent",
        capabilities: ["events"],
      });

    expect(connectResponse.status).toBe(201);
    expect(connectResponse.body).toMatchObject({
      roleKey: null,
      visualRole: null,
    });
  });

  it("resets the persisted position when the connected Agent changes role", async () => {
    await prisma.agentTeamBinding.create({
      data: { studentId: "student-1", roleKey: "ta" },
    });
    await prisma.agentWorldState.create({
      data: {
        studentId: "student-1",
        currentZone: "workstations",
        positionX: 500,
        positionY: 300,
        facing: "down",
        revision: 4,
      },
    });
    const studentToken = await loginAsStudent();
    const pairingResponse = await request(app.getHttpServer())
      .post("/agent-connectors/pairing")
      .set("Authorization", `Bearer ${studentToken}`);

    const connectResponse = await request(app.getHttpServer())
      .post("/agent-connectors/connect")
      .send({
        connectionCredential: pairingResponse.body.connectionCredential,
        provider: "codex-cli",
        clientName: "role-changing-agent",
        capabilities: ["events", "agent-task", "provider-process"],
        roleKey: "qa",
      });

    expect(connectResponse.status).toBe(201);
    expect(connectResponse.body).toMatchObject({
      roleKey: "qa",
      visualRole: "files",
    });
    await expect(
      prisma.agentWorldState.findUnique({ where: { studentId: "student-1" } }),
    ).resolves.toMatchObject({
      positionX: 122,
      positionY: 348,
      facing: "right",
      revision: 5,
    });
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

  it("stores event batches idempotently and advances a connector cursor", async () => {
    const { connectorToken, connectorId } = await pairConnector();
    const events = [
      {
        eventId: "batch-event-1",
        dayId: "day-1",
        type: "run.started",
        payload: { step: 1 },
        occurredAt: "2026-07-14T04:00:00.000Z"
      },
      {
        eventId: "batch-event-2",
        dayId: "day-1",
        type: "run.completed",
        payload: { step: 2 },
        occurredAt: "2026-07-14T04:00:01.000Z"
      }
    ];

    const first = await request(app.getHttpServer())
      .post("/agent-connectors/events/batch")
      .set("X-Agent-Connector-Token", connectorToken)
      .send({ events });
    const replay = await request(app.getHttpServer())
      .post("/agent-connectors/events/batch")
      .set("X-Agent-Connector-Token", connectorToken)
      .send({ events: events.map((event) => ({ ...event, payload: { replay: true } })) });

    expect(first.status).toBe(201);
    expect(replay.status).toBe(201);
    expect(replay.body.events.map((event: { id: string }) => event.id)).toEqual(
      first.body.events.map((event: { id: string }) => event.id)
    );
    expect(replay.body.events[0].payload).toEqual({ step: 1 });

    const firstPage = await request(app.getHttpServer())
      .get("/agent-connectors/events/cursor?limit=1")
      .set("X-Agent-Connector-Token", connectorToken);
    expect(firstPage.status).toBe(200);
    expect(firstPage.body).toMatchObject({
      hasMore: true,
      nextCursor: first.body.events[0].id,
      events: [expect.objectContaining({ connectorId, eventId: "batch-event-1" })]
    });

    const secondPage = await request(app.getHttpServer())
      .get(`/agent-connectors/events/cursor?limit=10&cursor=${firstPage.body.nextCursor}`)
      .set("X-Agent-Connector-Token", connectorToken);
    expect(secondPage.status).toBe(200);
    expect(secondPage.body).toMatchObject({
      hasMore: false,
      nextCursor: first.body.events[1].id,
      events: [expect.objectContaining({ eventId: "batch-event-2" })]
    });
  });

  it("marks a connector offline after 75 seconds without heartbeat", async () => {
    const { studentToken } = await pairConnector();
    await prisma.agentConnector.updateMany({
      where: { studentId: "student-1" },
      data: {
        status: "online",
        lastSeenAt: new Date(Date.now() - 76_000)
      }
    });

    const profile = await request(app.getHttpServer())
      .get("/agent-connectors/me")
      .set("Authorization", `Bearer ${studentToken}`);
    expect(profile.status).toBe(200);
    expect(profile.body.status).toBe("offline");
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
