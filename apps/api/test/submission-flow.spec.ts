import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import {
  AgentConnectorStatus,
  AgentSessionStatus,
  AgentTaskStatus,
  PrismaClient
} from "@prisma/client";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { seedDatabase } from "../prisma/seed";
import { AppModule } from "../src/app.module";
import { ReviewProcessingService } from "../src/modules/queue/review.processor";
import { ReviewQueueService } from "../src/modules/queue/review.queue";
import { MemoryService } from "../src/modules/memory/memory.service";
import { SopEngineService } from "../src/modules/memory/teaching-agents/sop-engine.service";
import { prepareTestDatabase } from "./support/test-database";

describe("submission flow", () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let reviewProcessingService: ReviewProcessingService;
  let cachedStudentToken: string | undefined;
  let cachedSecondStudentToken: string | undefined;
  let cachedTeacherToken: string | undefined;
  const enqueueReview = vi.fn(async (submissionId: string) => ({
    jobId: `review-${submissionId}`,
    status: "queued" as const
  }));

  function buildSubmissionBody(overrides: Partial<Record<string, unknown>> = {}) {
    return {
      clientRequestId: "submission-request-001",
      studentId: "student-1",
      courseWorldId: "course-world-1",
      dayId: "day-1",
      agentSessionId: "session-1",
      triggerType: "button",
      conversationSummary:
        "Student compared expected and actual output, then corrected the prompt.",
      workSummary: "Student produced a README and screenshot.",
      artifacts: [
        {
          kind: "doc",
          label: "README",
          url: "https://example.com/readme"
        }
      ],
      selfReflection: "I learned to tell the agent what success looks like.",
      agentEvaluationHints: ["one correction loop"],
      timestamp: "2026-06-29T12:00:00.000Z",
      ...overrides
    };
  }

  async function loginAs(email: string, password: string) {
    const response = await request(app.getHttpServer()).post("/auth/login").send({
      email,
      password
    });

    expect(response.status).toBe(201);
    const token = response.body.token as string;
    if (email === "lin@academy.test") cachedStudentToken = token;
    if (email === "mo@academy.test") cachedSecondStudentToken = token;
    if (email === "teacher@academy.test") cachedTeacherToken = token;
    return token;
  }

  async function loginAsStudent() {
    if (cachedStudentToken) return cachedStudentToken;
    return loginAs("lin@academy.test", "student-pass-123");
  }

  async function loginAsSecondStudent() {
    if (cachedSecondStudentToken) return cachedSecondStudentToken;
    return loginAs("mo@academy.test", "student-pass-456");
  }

  async function loginAsTeacher() {
    if (cachedTeacherToken) return cachedTeacherToken;
    return loginAs("teacher@academy.test", "teacher-pass-123");
  }

  beforeAll(async () => {
    // Review-flow tests exercise deterministic fallback scoring and must not
    // call a developer-configured external LLM.
    delete process.env.ARK_API_KEY;
    prisma = await prepareTestDatabase("submission-flow");

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule]
    })
      .overrideProvider(MemoryService)
      .useValue({
        observe: async () => undefined,
        retrieve: async () => []
      })
      .overrideProvider(SopEngineService)
      .useValue({
        // The async SOP is outside the submission-flow assertions. Returning
        // undefined makes its optional side effect fail closed, leaving the
        // queued review available for the explicit processor call below.
        runSop: async () => undefined
      })
      .overrideProvider(ReviewQueueService)
      .useValue({
        enqueue: enqueueReview
      })
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
    reviewProcessingService = app.get(ReviewProcessingService);
  });

  beforeEach(async () => {
    enqueueReview.mockClear();
    enqueueReview.mockImplementation(async (submissionId: string) => ({
      jobId: `review-${submissionId}`,
      status: "queued" as const
    }));
    await prisma.reviewResult.deleteMany();
    await prisma.agentSubmission.deleteMany();
    await prisma.agentTaskAttempt.deleteMany();
    await prisma.agentTaskDependency.deleteMany();
    await prisma.agentTask.deleteMany();
    await prisma.agentEvent.deleteMany();
    await prisma.agentConnector.deleteMany();
    await prisma.agentSession.deleteMany({ where: { id: { not: "session-1" } } });
    await prisma.guildMembership.deleteMany({ where: { guildId: { not: "guild-1" } } });
    await prisma.guild.deleteMany({ where: { id: { not: "guild-1" } } });
    await prisma.agentConnector.create({
      data: {
        id: "connector-1",
        studentId: "student-1",
        agentSessionId: "session-1",
        provider: "claude-code",
        clientName: "Submission Flow Connector",
        tokenHash: "submission-flow-token-1",
        status: AgentConnectorStatus.online,
        capabilities: ["submit"],
        lastSeenAt: new Date()
      }
    });
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it("lists seeded guilds and prevents a student from creating a second guild", async () => {
    const studentToken = await loginAsStudent();
    const listResponse = await request(app.getHttpServer())
      .get("/guilds")
      .set("Authorization", `Bearer ${studentToken}`);
    const createResponse = await request(app.getHttpServer())
      .post("/guilds")
      .set("Authorization", `Bearer ${studentToken}`)
      .send({
        name: "Night Shift",
        description: "Students pair on daily agent quests and share review notes."
      });
    const refreshedListResponse = await request(app.getHttpServer())
      .get("/guilds")
      .set("Authorization", `Bearer ${studentToken}`);

    expect(listResponse.status).toBe(200);
    expect(listResponse.body).toEqual([
      {
        id: "guild-1",
        name: "Morning Forge",
        description: "Students collaborate on daily agent quests and peer review.",
        memberCount: 3,
        collaborationPoints: 12,
        viewerMembership: {
          id: "guild-membership-1",
          userId: "student-1",
          role: "leader",
          status: "active"
        }
      }
    ]);

    expect(createResponse.status).toBe(409);

    expect(refreshedListResponse.status).toBe(200);
    expect(refreshedListResponse.body).toEqual([
      {
        id: "guild-1",
        name: "Morning Forge",
        description: "Students collaborate on daily agent quests and peer review.",
        memberCount: 3,
        collaborationPoints: 12,
        viewerMembership: {
          id: "guild-membership-1",
          userId: "student-1",
          role: "leader",
          status: "active"
        }
      }
    ]);
  });

  it("creates a room access grant", async () => {
    const studentToken = await loginAsStudent();
    const response = await request(app.getHttpServer())
      .post("/rooms/access-grants")
      .set("Authorization", `Bearer ${studentToken}`)
      .send({
        roomId: "room-chat-student-1",
        granteeId: "student-2"
      });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      roomId: "room-chat-student-1",
      granteeId: "student-2",
      granteeName: "Mo",
      status: "approved",
      scope: "chat_summary"
    });
    expect(response.body.id).toEqual(expect.any(String));
    expect(response.body.createdAt).toEqual(expect.any(String));
    expect(response.body.expiresAt).toEqual(expect.any(String));
  });

  it("accepts a student submission and returns a suggested review", async () => {
    const studentToken = await loginAsStudent();
    const response = await request(app.getHttpServer())
      .post("/submissions")
      .set("Authorization", `Bearer ${studentToken}`)
      .send(buildSubmissionBody());

    expect(response.status).toBe(201);
    expect(response.body.submission).toMatchObject({
      id: expect.any(String),
      clientRequestId: "submission-request-001",
      studentId: "student-1",
      courseWorldId: "course-world-1",
      dayId: "day-1",
      agentSessionId: "session-1",
      triggerType: "button",
      artifacts: [
        {
          kind: "doc",
          label: "README",
          url: "https://example.com/readme"
        }
      ],
      agentEvaluationHints: ["one correction loop"],
      timestamp: "2026-06-29T12:00:00.000Z"
    });
    expect(response.body.review).toEqual({
      submissionId: response.body.submission.id,
      status: "queued",
      suggestedScore: null,
      finalScore: null,
      decision: null,
      rationale: "AI review queued.",
      riskFlags: []
    });
    expect(response.body.queue).toEqual({
      jobId: `review-${response.body.submission.id}`,
      status: "queued"
    });

    const persistedSubmission = await prisma.agentSubmission.findUniqueOrThrow({
      where: { id: response.body.submission.id },
      include: { reviewResult: true }
    });

    expect(persistedSubmission.studentId).toBe("student-1");
    expect(persistedSubmission.courseWorldId).toBe("course-world-1");
    expect(persistedSubmission.agentSessionId).toBe("session-1");
    expect(persistedSubmission.submittedAt.toISOString()).toBe(
      "2026-06-29T12:00:00.000Z"
    );
    expect(persistedSubmission.artifacts).toEqual([
      {
        kind: "doc",
        label: "README",
        url: "https://example.com/readme"
      }
    ]);
    expect(persistedSubmission.agentEvaluationHints).toEqual([
      "one correction loop"
    ]);
    expect(persistedSubmission.reviewResult).toMatchObject({
      status: "queued",
      suggestedScore: null,
      finalScore: null,
      decision: null,
      rationale: "AI review queued."
    });
  });

  it("turns a completed assigned Agent task into real submission evidence after student confirmation", async () => {
    const studentToken = await loginAsStudent();
    const otherStudentToken = await loginAsSecondStudent();
    await prisma.agentTask.create({
      data: {
        id: "assigned-task-1",
        runId: "day-1-student-1-frontend",
        courseWorldId: "course-world-1",
        dayId: "day-1",
        studentId: "student-1",
        provider: "claude-code",
        requiredCapabilities: ["provider-process"],
        status: AgentTaskStatus.completed,
        payload: {
          instruction: "完成 Day 1 页面并运行前端测试"
        },
        result: {
          runId: "day-1-student-1-frontend",
          dayId: "day-1",
          provider: "claude-code",
          succeeded: true,
          exitCode: 0,
          output: "Implemented the page. 12 tests passed.",
          outputTruncated: false,
          timedOut: false,
          cancelled: false,
          durationMs: 4200
        },
        attemptCount: 1,
        leaseOwnerId: "connector-1",
        completedAt: new Date("2026-07-15T02:00:00.000Z")
      }
    });

    const otherStudentRuns = await request(app.getHttpServer())
      .get("/agent-orchestration/my-runs")
      .set("Authorization", `Bearer ${otherStudentToken}`);
    const forbiddenConfirmation = await request(app.getHttpServer())
      .post("/submissions/from-agent-task")
      .set("Authorization", `Bearer ${otherStudentToken}`)
      .send({
        runId: "day-1-student-1-frontend",
        selfReflection:
          "我不能确认其他学生的任务，这个请求应由后端权限边界拒绝。"
      });
    expect(otherStudentRuns.status).toBe(200);
    expect(otherStudentRuns.body).toEqual([]);
    expect(forbiddenConfirmation.status).toBe(403);

    const assignedBeforeSubmission = await request(app.getHttpServer())
      .get("/agent-orchestration/my-runs")
      .set("Authorization", `Bearer ${studentToken}`);

    expect(assignedBeforeSubmission.status).toBe(200);
    expect(assignedBeforeSubmission.body).toEqual([
      expect.objectContaining({
        id: "assigned-task-1",
        runId: "day-1-student-1-frontend",
        studentId: "student-1",
        courseWorldId: "course-world-1",
        dayId: "day-1",
        status: "completed",
        result: expect.objectContaining({
          exitCode: 0,
          output: "Implemented the page. 12 tests passed."
        }),
        submission: null
      })
    ]);

    const confirmation = await request(app.getHttpServer())
      .post("/submissions/from-agent-task")
      .set("Authorization", `Bearer ${studentToken}`)
      .send({
        runId: "day-1-student-1-frontend",
        selfReflection:
          "我确认 Agent 已完成页面实现，并根据测试结果检查了交付内容。"
      });

    expect(confirmation.status).toBe(201);
    expect(confirmation.body.submission).toMatchObject({
      clientRequestId: "agent-task:assigned-task-1",
      studentId: "student-1",
      courseWorldId: "course-world-1",
      dayId: "day-1",
      agentSessionId: "session-1",
      triggerType: "button",
      workSummary: expect.stringContaining(
        "Implemented the page. 12 tests passed."
      ),
      artifacts: [
        {
          kind: "command_log",
          label: "Agent 任务 day-1-student-1-frontend 执行证据",
          url: "/agent-team#agent-run-assigned-task-1"
        }
      ],
      agentEvaluationHints: expect.arrayContaining([
        "Agent provider: claude-code",
        "Process exit code: 0",
        "Execution duration: 4200ms",
        "Output truncated: no"
      ])
    });
    expect(confirmation.body.review.status).toBe("queued");
    expect(confirmation.body.queue).toEqual({
      jobId: `review-${confirmation.body.submission.id}`,
      status: "queued"
    });

    const persisted = await prisma.agentSubmission.findUniqueOrThrow({
      where: {
        studentId_clientRequestId: {
          studentId: "student-1",
          clientRequestId: "agent-task:assigned-task-1"
        }
      },
      include: { reviewResult: true }
    });
    expect(persisted.workSummary).toContain("12 tests passed");
    expect(persisted.reviewResult?.status).toBe("queued");

    const assignedAfterSubmission = await request(app.getHttpServer())
      .get("/agent-orchestration/my-runs")
      .set("Authorization", `Bearer ${studentToken}`);
    expect(assignedAfterSubmission.body[0].submission).toMatchObject({
      id: confirmation.body.submission.id,
      reviewStatus: "queued",
      decision: null
    });
  });

  it("returns the same submission for an idempotent retry and rejects a second pending request", async () => {
    const studentToken = await loginAsStudent();
    const first = await request(app.getHttpServer())
      .post("/submissions")
      .set("Authorization", `Bearer ${studentToken}`)
      .send(buildSubmissionBody());
    const retry = await request(app.getHttpServer())
      .post("/submissions")
      .set("Authorization", `Bearer ${studentToken}`)
      .send(buildSubmissionBody());
    const competing = await request(app.getHttpServer())
      .post("/submissions")
      .set("Authorization", `Bearer ${studentToken}`)
      .send(buildSubmissionBody({ clientRequestId: "submission-request-002" }));

    expect(retry.status).toBe(201);
    expect(retry.body.submission.id).toBe(first.body.submission.id);
    expect(competing.status).toBe(409);
    expect(await prisma.agentSubmission.count()).toBe(1);
  });

  it("keeps the submission queued when Redis is unavailable", async () => {
    enqueueReview.mockRejectedValueOnce(new Error("Redis offline"));
    const studentToken = await loginAsStudent();
    const response = await request(app.getHttpServer())
      .post("/submissions")
      .set("Authorization", `Bearer ${studentToken}`)
      .send(buildSubmissionBody());

    expect(response.status).toBe(201);
    expect(response.body.queue).toEqual({
      jobId: `review-${response.body.submission.id}`,
      status: "waiting_for_queue"
    });
    expect(
      await prisma.reviewResult.findUnique({
        where: { submissionId: response.body.submission.id }
      })
    ).toMatchObject({ status: "queued" });
  });

  it("lets a teacher read the complete submission, review snapshot, and Agent evidence", async () => {
    const studentToken = await loginAsStudent();
    const teacherToken = await loginAsTeacher();
    await prisma.agentEvent.create({
      data: {
        eventId: "submission-evidence-event-1",
        connectorId: "connector-1",
        studentId: "student-1",
        dayId: "day-1",
        type: "task.completed",
        payload: { command: "pnpm test", exitCode: 0 },
        occurredAt: new Date("2026-06-29T11:59:00.000Z")
      }
    });
    const createResponse = await request(app.getHttpServer())
      .post("/submissions")
      .set("Authorization", `Bearer ${studentToken}`)
      .send(
        buildSubmissionBody({
          artifacts: [
            {
              kind: "command_log",
              label: "Test output",
              url: "/artifacts/submission-1/test-output.txt"
            }
          ]
        })
      );

    const response = await request(app.getHttpServer())
      .get(`/submissions/${createResponse.body.submission.id}`)
      .set("Authorization", `Bearer ${teacherToken}`);

    expect(response.status).toBe(200);
    expect(response.body.submission).toMatchObject({
      id: createResponse.body.submission.id,
      studentName: "Lin",
      dayTitle: "首次 Agent 协作：把需求变成可验收任务",
      workSummary: "Student produced a README and screenshot.",
      selfReflection: "I learned to tell the agent what success looks like.",
      artifacts: [
        {
          kind: "command_log",
          label: "Test output",
          url: "/artifacts/submission-1/test-output.txt"
        }
      ]
    });
    expect(response.body.review).toMatchObject({
      submissionId: createResponse.body.submission.id,
      status: "queued"
    });
    expect(response.body.agentEvents).toEqual([
      {
        eventId: "submission-evidence-event-1",
        type: "task.completed",
        payload: { command: "pnpm test", exitCode: 0 },
        occurredAt: "2026-06-29T11:59:00.000Z"
      }
    ]);
  });

  it("rejects anonymous submission creation", async () => {
    const response = await request(app.getHttpServer())
      .post("/submissions")
      .send(buildSubmissionBody());

    expect(response.status).toBe(401);
  });

  it("rejects a student submission when body.studentId does not match the current student", async () => {
    const studentToken = await loginAsStudent();
    const response = await request(app.getHttpServer())
      .post("/submissions")
      .set("Authorization", `Bearer ${studentToken}`)
      .send(
        buildSubmissionBody({
          studentId: "student-2"
        })
      );

    expect(response.status).toBe(403);
  });

  it("rejects a student submission when agentSessionId belongs to another student", async () => {
    const studentToken = await loginAsStudent();
    await prisma.agentSession.create({
      data: {
        id: "session-2",
        studentId: "student-2",
        provider: "claude-code",
        status: AgentSessionStatus.active
      }
    });
    await prisma.agentConnector.create({
      data: {
        id: "connector-2",
        studentId: "student-2",
        agentSessionId: "session-2",
        provider: "claude-code",
        clientName: "Submission Flow Connector 2",
        tokenHash: "submission-flow-token-2",
        status: AgentConnectorStatus.online,
        capabilities: ["submit"],
        lastSeenAt: new Date()
      }
    });

    const response = await request(app.getHttpServer())
      .post("/submissions")
      .set("Authorization", `Bearer ${studentToken}`)
      .send(
        buildSubmissionBody({
          agentSessionId: "session-2"
        })
      );

    expect(response.status).toBe(403);
  });

  it("records a teacher review decision", async () => {
    const teacherToken = await loginAsTeacher();
    const studentToken = await loginAsStudent();
    const submissionResponse = await request(app.getHttpServer())
      .post("/submissions")
      .set("Authorization", `Bearer ${studentToken}`)
      .send(buildSubmissionBody());

    await prisma.reviewResult.update({
      where: { submissionId: submissionResponse.body.submission.id },
      data: {
        status: "needs_teacher",
        suggestedScore: 85,
        decision: null,
        rationale: "AI review failed and requires teacher handling.",
        aiReviewedAt: new Date()
      }
    });

    const response = await request(app.getHttpServer())
      .post("/reviews/decide")
      .set("Authorization", `Bearer ${teacherToken}`)
      .send({
        submissionId: submissionResponse.body.submission.id,
        finalScore: 90,
        decision: "adjust"
      });

    expect(response.status).toBe(201);
    expect(response.body).toEqual({
      submissionId: submissionResponse.body.submission.id,
      finalScore: 90,
      decision: "adjust"
    });

    const persistedReview = await prisma.reviewResult.findUniqueOrThrow({
      where: { submissionId: submissionResponse.body.submission.id }
    });

    expect(persistedReview.status).toBe("teacher_decided");
    expect(persistedReview.finalScore).toBe(90);
    expect(persistedReview.decision).toBe("adjust");
    expect(persistedReview.decidedAt).not.toBeNull();
    expect(
      await prisma.agentSubmission.findUniqueOrThrow({
        where: { id: submissionResponse.body.submission.id }
      })
    ).toMatchObject({ pendingReviewKey: null });
  });

  it("returns a teacher review list with summary and latest-first items", async () => {
    const teacherToken = await loginAsTeacher();
    const firstStudentToken = await loginAsStudent();
    const secondStudentToken = await loginAsSecondStudent();
    await prisma.agentSession.create({
      data: {
        id: "session-2",
        studentId: "student-2",
        provider: "claude-code",
        status: AgentSessionStatus.active
      }
    });
    await prisma.agentConnector.create({
      data: {
        id: "connector-2",
        studentId: "student-2",
        agentSessionId: "session-2",
        provider: "claude-code",
        clientName: "Submission Flow Connector 2",
        tokenHash: "submission-flow-token-2",
        status: AgentConnectorStatus.online,
        capabilities: ["submit"],
        lastSeenAt: new Date()
      }
    });

    const firstSubmission = await request(app.getHttpServer())
      .post("/submissions")
      .set("Authorization", `Bearer ${firstStudentToken}`)
      .send(
        buildSubmissionBody({
          timestamp: "2026-06-29T08:00:00.000Z"
        })
      );

    const secondSubmission = await request(app.getHttpServer())
      .post("/submissions")
      .set("Authorization", `Bearer ${secondStudentToken}`)
      .send(
        buildSubmissionBody({
          studentId: "student-2",
          dayId: "day-2",
          agentSessionId: "session-2",
          conversationSummary:
            "Student prepared a peer review checklist and updated the prompt.",
          workSummary: "Student submitted notes for the next review round.",
          artifacts: [
            {
              kind: "doc",
              label: "Notes",
              url: "https://example.com/notes"
            }
          ],
          selfReflection: "I can now explain why the second draft is better.",
          agentEvaluationHints: ["peer review prep"],
          timestamp: "2026-06-29T09:00:00.000Z"
        })
      );

    await prisma.reviewResult.updateMany({
      where: {
        submissionId: {
          in: [
            firstSubmission.body.submission.id,
            secondSubmission.body.submission.id
          ]
        }
      },
      data: {
        status: "ai_reviewed",
        suggestedScore: 85,
        decision: "approve",
        rationale: "Clear goal, evidence of correction, and visible artifact.",
        aiReviewedAt: new Date()
      }
    });

    await request(app.getHttpServer())
      .post("/reviews/decide")
      .set("Authorization", `Bearer ${teacherToken}`)
      .send({
        submissionId: secondSubmission.body.submission.id,
        finalScore: 90,
        decision: "adjust"
      });

    const response = await request(app.getHttpServer())
      .get("/reviews")
      .set("Authorization", `Bearer ${teacherToken}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      summary: {
        pendingCount: 1,
        queuedCount: 0,
        pendingTeacherDecisionCount: 1,
        reviewedToday: 1,
        flaggedCount: 1
      },
      items: [
        {
          submissionId: secondSubmission.body.submission.id,
          studentName: "Mo",
          guildName: "Morning Forge",
          suggestedScore: 85,
          finalScore: 90,
          decision: "adjust",
          reviewStatus: "teacher_decided",
          isPendingTeacherDecision: false,
          rationale: "Clear goal, evidence of correction, and visible artifact.",
          dayLabel: "Day 2",
          submittedAt: "2026-06-29T09:00:00.000Z"
        },
        {
          submissionId: firstSubmission.body.submission.id,
          studentName: "Lin",
          guildName: "Morning Forge",
          suggestedScore: 85,
          finalScore: null,
          decision: null,
          reviewStatus: "ai_reviewed",
          isPendingTeacherDecision: true,
          rationale: "Clear goal, evidence of correction, and visible artifact.",
          dayLabel: "Day 1",
          submittedAt: "2026-06-29T08:00:00.000Z"
        }
      ],
      pagination: {
        page: 1,
        pageSize: 50,
        total: 2
      }
    });
  });
});
