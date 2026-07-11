import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { PrismaClient } from "@prisma/client";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";
import { seedDatabase } from "../prisma/seed";
import { prepareTestDatabase } from "./support/test-database";

describe("classroom control flow", () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let teacherToken: string;
  let studentToken: string;
  let assistantToken: string;

  async function loginAs(email: string, password: string) {
    const response = await request(app.getHttpServer()).post("/auth/login").send({
      email,
      password
    });

    expect(response.status).toBe(201);
    return response.body.token as string;
  }

  async function getSeededSession(token: string) {
    const response = await request(app.getHttpServer())
      .get("/classrooms/sessions/classroom-session-1")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    return response.body as {
      session: { id: string; version: number };
      currentStage: { id: string; version: number; status: string } | null;
      stages: Array<{ id: string; version: number; status: string; sortOrder: number }>;
      viewer: { role: string; canControlStages: boolean };
    };
  }

  beforeAll(async () => {
    prisma = await prepareTestDatabase("classroom-flow");

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule]
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    teacherToken = await loginAs("teacher@academy.test", "teacher-pass-123");
    studentToken = await loginAs("lin@academy.test", "student-pass-123");
    assistantToken = await loginAs("kai@academy.test", "student-pass-789");
  });

  beforeEach(async () => {
    // Keep the three authenticated sessions alive while resetting only the
    // classroom state; the login endpoint is intentionally rate limited.
    await prisma.classroomEvent.deleteMany();
    await prisma.helpRequest.deleteMany();
    await prisma.classroomStage.updateMany({
      data: {
        extensionSeconds: 0,
        startedAt: null,
        pausedAt: null,
        accumulatedPauseSeconds: 0,
        status: "draft",
        version: 0
      }
    });
    await prisma.classroomSession.updateMany({
      data: {
        status: "draft",
        currentStageId: null,
        startedAt: null,
        endedAt: null,
        version: 0
      }
    });
  });

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  it("returns a seeded classroom snapshot and active classroom for the teacher", async () => {
    const snapshot = await getSeededSession(teacherToken);
    expect(snapshot.session).toMatchObject({
      id: "classroom-session-1",
      status: "draft",
      version: 0
    });
    expect(snapshot.currentStage).toBeNull();
    expect(snapshot.stages).toHaveLength(4);
    expect(snapshot.viewer).toMatchObject({
      role: "teacher",
      canControlStages: true
    });

    const active = await request(app.getHttpServer())
      .get("/classrooms/sessions/active")
      .set("Authorization", `Bearer ${teacherToken}`);

    expect(active.status).toBe(200);
    expect(active.body.session.id).toBe("classroom-session-1");
  });

  it("lets the teacher start, pause, extend, complete, and unlock the next stage", async () => {
    const snapshot = await getSeededSession(teacherToken);
    const firstStage = snapshot.stages[0];

    const start = await request(app.getHttpServer())
      .post(`/classrooms/stages/${firstStage.id}/start`)
      .set("Authorization", `Bearer ${teacherToken}`)
      .send({ expectedVersion: firstStage.version });

    expect(start.status).toBe(201);
    expect(start.body.currentStage.status).toBe("running");

    const paused = await request(app.getHttpServer())
      .post(`/classrooms/stages/${firstStage.id}/pause`)
      .set("Authorization", `Bearer ${teacherToken}`)
      .send({ expectedVersion: start.body.currentStage.version });
    expect(paused.status).toBe(201);
    expect(paused.body.currentStage.status).toBe("paused");

    const resumed = await request(app.getHttpServer())
      .post(`/classrooms/stages/${firstStage.id}/start`)
      .set("Authorization", `Bearer ${teacherToken}`)
      .send({ expectedVersion: paused.body.currentStage.version });
    expect(resumed.status).toBe(201);
    expect(resumed.body.currentStage.status).toBe("running");

    const pausedAgain = await request(app.getHttpServer())
      .post(`/classrooms/stages/${firstStage.id}/pause`)
      .set("Authorization", `Bearer ${teacherToken}`)
      .send({ expectedVersion: resumed.body.currentStage.version });
    expect(pausedAgain.status).toBe(201);
    expect(pausedAgain.body.currentStage.status).toBe("paused");

    const extended = await request(app.getHttpServer())
      .post(`/classrooms/stages/${firstStage.id}/extend`)
      .set("Authorization", `Bearer ${teacherToken}`)
      .send({ expectedVersion: pausedAgain.body.currentStage.version, seconds: 300 });
    expect(extended.status).toBe(201);
    expect(extended.body.currentStage.extensionSeconds).toBe(300);

    const completed = await request(app.getHttpServer())
      .post(`/classrooms/stages/${firstStage.id}/complete`)
      .set("Authorization", `Bearer ${teacherToken}`)
      .send({ expectedVersion: extended.body.currentStage.version });
    expect(completed.status).toBe(201);
    expect(completed.body.currentStage.status).toBe("completed");

    const unlocked = await request(app.getHttpServer())
      .post(`/classrooms/stages/${firstStage.id}/unlock-next`)
      .set("Authorization", `Bearer ${teacherToken}`)
      .send({ expectedVersion: completed.body.currentStage.version });
    expect(unlocked.status).toBe(201);
    expect(unlocked.body.session.currentStageId).toBe("classroom-stage-practice");
    expect(unlocked.body.currentStage.id).toBe("classroom-stage-practice");

    const event = await prisma.classroomEvent.findFirstOrThrow({
      where: {
        sessionId: snapshot.session.id,
        eventType: "stage_started",
        targetId: firstStage.id
      }
    });
    expect(event.actorId).toBe("teacher-1");
  });

  it("lets the teacher end a running stage early", async () => {
    const snapshot = await getSeededSession(teacherToken);
    const stage = snapshot.stages[0];
    const start = await request(app.getHttpServer())
      .post(`/classrooms/stages/${stage.id}/start`)
      .set("Authorization", `Bearer ${teacherToken}`)
      .send({ expectedVersion: stage.version });

    const ended = await request(app.getHttpServer())
      .post(`/classrooms/stages/${stage.id}/end-early`)
      .set("Authorization", `Bearer ${teacherToken}`)
      .send({ expectedVersion: start.body.currentStage.version });

    expect(ended.status).toBe(201);
    expect(ended.body.currentStage.status).toBe("ended_early");
  });

  it("rejects student and assistant accounts from stage control", async () => {
    const snapshot = await getSeededSession(teacherToken);
    const stageId = snapshot.stages[0].id;

    const studentResponse = await request(app.getHttpServer())
      .post(`/classrooms/stages/${stageId}/start`)
      .set("Authorization", `Bearer ${studentToken}`)
      .send({ expectedVersion: 0 });
    expect(studentResponse.status).toBe(403);

    const assistantResponse = await request(app.getHttpServer())
      .post(`/classrooms/stages/${stageId}/start`)
      .set("Authorization", `Bearer ${assistantToken}`)
      .send({ expectedVersion: 0 });
    expect(assistantResponse.status).toBe(403);
  });

  it("rejects stale expectedVersion with 409", async () => {
    const snapshot = await getSeededSession(teacherToken);
    const stage = snapshot.stages[0];
    const start = await request(app.getHttpServer())
      .post(`/classrooms/stages/${stage.id}/start`)
      .set("Authorization", `Bearer ${teacherToken}`)
      .send({ expectedVersion: stage.version });
    expect(start.status).toBe(201);

    const response = await request(app.getHttpServer())
      .post(`/classrooms/stages/${stage.id}/pause`)
      .set("Authorization", `Bearer ${teacherToken}`)
      .send({ expectedVersion: 0 });
    expect(response.status).toBe(409);
  });

  it("lets the teacher create a new draft session with ordered stages", async () => {
    const response = await request(app.getHttpServer())
      .post("/classrooms/sessions")
      .set("Authorization", `Bearer ${teacherToken}`)
      .send({
        courseWorldId: "course-world-1",
        dayId: "day-2",
        stages: [{ title: "讲解", durationSeconds: 600 }]
      });

    expect(response.status).toBe(201);
    expect(response.body.session.status).toBe("draft");
    expect(response.body.stages[0].sortOrder).toBe(0);
    expect(response.body.stages[0].status).toBe("draft");

    const invalid = await request(app.getHttpServer())
      .post("/classrooms/sessions")
      .set("Authorization", `Bearer ${teacherToken}`)
      .send({
        courseWorldId: "course-world-1",
        dayId: "day-2",
        stages: [{ title: "", durationSeconds: 0 }]
      });
    expect(invalid.status).toBe(422);
  });
});
