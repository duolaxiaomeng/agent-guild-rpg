import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { AgentOrchestrationController } from "../src/modules/agent-orchestration/agent-orchestration.controller";
import { AgentOrchestrationService } from "../src/modules/agent-orchestration/agent-orchestration.service";
import {
  AGENT_LOOP_RUNNER,
  AGENT_ORCHESTRATION_OPTIONS,
  AGENT_RUN_STATE_PERSISTENCE,
  type AgentRunStatePersistence,
} from "../src/modules/agent-orchestration/agent-orchestration.tokens";
import type {
  AgentLoopRunner,
  AgentRunEvent,
} from "../src/modules/agent-orchestration/orchestrator";
import { AuthGuard } from "../src/modules/auth/auth.guard";
import { AuthService } from "../src/modules/auth/auth.service";

describe("Agent orchestration API", () => {
  let app: INestApplication;
  const events: AgentRunEvent[] = [];

  beforeAll(async () => {
    const authService = {
      getSession: vi.fn(async (token: string) => ({
        token,
        user: {
          id: token === "student-token" ? "student-1" : "teacher-1",
          role: token === "student-token" ? "student" : "teacher",
          displayName: token === "student-token" ? "Lin" : "Teacher Chen",
        },
      })),
    };
    const runner: AgentLoopRunner = {
      run: vi.fn(
        (_run, control) =>
          new Promise((resolve) => {
            control.signal.addEventListener("abort", () => resolve("aborted"));
          }),
      ),
    };
    const persistence: AgentRunStatePersistence = {
      save: vi.fn((event: AgentRunEvent) => {
        events.push(event);
      }),
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [AgentOrchestrationController],
      providers: [
        AgentOrchestrationService,
        AuthGuard,
        { provide: AuthService, useValue: authService },
        { provide: AGENT_LOOP_RUNNER, useValue: runner },
        { provide: AGENT_RUN_STATE_PERSISTENCE, useValue: persistence },
        { provide: AGENT_ORCHESTRATION_OPTIONS, useValue: { maxConcurrency: 1 } },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it("requires authentication and limits orchestration to teachers", async () => {
    const unauthenticated = await request(app.getHttpServer()).get(
      "/agent-orchestration/runs",
    );
    expect(unauthenticated.status).toBe(401);

    const student = await request(app.getHttpServer())
      .post("/agent-orchestration/runs")
      .set("Authorization", "Bearer student-token")
      .send({ runId: "forbidden-run" });
    expect(student.status).toBe(403);
  });

  it("creates, lists, gets and schedules runs", async () => {
    const createParent = await teacherPost("/agent-orchestration/runs")
      .send({ runId: "parent", input: { task: "review" } });
    expect(createParent.status).toBe(201);
    expect(createParent.body).toMatchObject({
      runId: "parent",
      input: { task: "review" },
      dependencies: [],
      status: "queued",
    });

    const createChild = await teacherPost("/agent-orchestration/runs")
      .send({ runId: "child", dependencies: ["parent"] });
    expect(createChild.status).toBe(201);

    const list = await teacherGet("/agent-orchestration/runs");
    expect(list.status).toBe(200);
    expect(list.body.map((run: { runId: string }) => run.runId)).toEqual([
      "parent",
      "child",
    ]);

    const detail = await teacherGet(
      "/agent-orchestration/runs/child",
    );
    expect(detail.status).toBe(200);
    expect(detail.body).toMatchObject({
      runId: "child",
      dependencies: ["parent"],
      status: "queued",
    });

    const scheduled = await teacherPost(
      "/agent-orchestration/schedule",
    );
    expect(scheduled.status).toBe(202);
    expect(scheduled.body.runs).toEqual([
      expect.objectContaining({ runId: "parent", status: "running" }),
      expect.objectContaining({ runId: "child", status: "queued" }),
    ]);
  });

  it("pauses, resumes and cancels a running task", async () => {
    const paused = await teacherPost(
      "/agent-orchestration/runs/parent/pause",
    );
    expect(paused.status).toBe(200);
    expect(paused.body.status).toBe("paused");

    const resumed = await teacherPost(
      "/agent-orchestration/runs/parent/resume",
    );
    expect(resumed.status).toBe(200);
    expect(resumed.body.status).toBe("running");

    const cancelled = await teacherPost(
      "/agent-orchestration/runs/parent/cancel",
    );
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.status).toBe("cancelled");

    expect(events.map((event) => event.run.status)).toEqual(
      expect.arrayContaining(["queued", "running", "paused", "cancelled"]),
    );
  });

  it("maps not-found, duplicate and invalid state errors to stable HTTP responses", async () => {
    const missing = await teacherGet(
      "/agent-orchestration/runs/missing",
    );
    expect(missing.status).toBe(404);

    const duplicate = await teacherPost("/agent-orchestration/runs")
      .send({ runId: "parent" });
    expect(duplicate.status).toBe(409);

    const invalidState = await teacherPost(
      "/agent-orchestration/runs/parent/resume",
    );
    expect(invalidState.status).toBe(409);
  });

  function teacherGet(path: string) {
    return request(app.getHttpServer()).get(path).set(
      "Authorization",
      "Bearer teacher-token",
    );
  }

  function teacherPost(path: string) {
    return request(app.getHttpServer()).post(path).set(
      "Authorization",
      "Bearer teacher-token",
    );
  }
});
