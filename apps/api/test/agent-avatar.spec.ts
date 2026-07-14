import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import {
  PrismaClient,
  ReviewStatus,
  SubmissionTriggerType
} from "@prisma/client";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";
import { seedDatabase } from "../prisma/seed";
import { prepareTestDatabase } from "./support/test-database";

describe("agent avatar api", () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let studentToken: string;

  async function loginAsStudent() {
    const response = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email: "lin@academy.test", password: "student-pass-123" });
    expect(response.status).toBe(201);
    return response.body.token as string;
  }

  function get(path: string) {
    return request(app.getHttpServer())
      .get(path)
      .set("Authorization", `Bearer ${studentToken}`);
  }

  beforeAll(async () => {
    prisma = await prepareTestDatabase("agent-avatar");

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule]
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  beforeEach(async () => {
    await seedDatabase(prisma);
    await prisma.reviewResult.deleteMany();
    await prisma.agentSubmission.deleteMany();
    studentToken = await loginAsStudent();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it("GET /agent-avatars returns all student avatars with derived status", async () => {
    const response = await get("/agent-avatars");

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body)).toBe(true);
    expect(response.body).toHaveLength(3);

    // student-1 (Lin) is online with an active agent session
    const lin = response.body.find((a: any) => a.studentId === "student-1");
    expect(lin).toBeDefined();
    expect(lin.displayName).toBe("Lin");
    expect(lin.status).toBe("idle");
    expect(lin.currentZone).toBe("workstations");
    expect(lin.activitySummary).toBe("空闲");

    // student-2 (Mo) is offline
    const mo = response.body.find((a: any) => a.studentId === "student-2");
    expect(mo).toBeDefined();
    expect(mo.displayName).toBe("Mo");
    expect(mo.status).toBe("offline");

    // student-3 (Kai) is online
    const kai = response.body.find((a: any) => a.studentId === "student-3");
    expect(kai).toBeDefined();
    expect(kai.displayName).toBe("Kai");
    expect(kai.status).toBe("idle");
  });

  it("GET /agent-avatars/:studentId returns a single avatar", async () => {
    const response = await get("/agent-avatars/student-1");

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      studentId: "student-1",
      displayName: "Lin",
      status: "idle",
      currentZone: "workstations"
    });
  });

  it("derives working status when a student has a recent submission", async () => {
    await prisma.agentSubmission.create({
      data: {
        id: "avatar-submission-working",
        studentId: "student-1",
        courseWorldId: "course-world-1",
        dayId: "day-1",
        agentSessionId: "session-1",
        triggerType: SubmissionTriggerType.button,
        conversationSummary: "Working on the latest task.",
        workSummary: "正在实现界面...",
        artifacts: [],
        selfReflection: "Making good progress.",
        agentEvaluationHints: [],
        submittedAt: new Date()
      }
    });

    const response = await get("/agent-avatars/student-1");

    expect(response.status).toBe(200);
    expect(response.body.status).toBe("working");
    expect(response.body.activitySummary).toContain("正在实现界面");
  });

  it("derives reviewing status when a student has a pending review", async () => {
    // Create an older submission (outside working window) with a queued review
    const oldDate = new Date(Date.now() - 60 * 60 * 1000); // 1 hour ago
    await prisma.agentSubmission.create({
      data: {
        id: "avatar-submission-reviewing",
        studentId: "student-3",
        courseWorldId: "course-world-1",
        dayId: "day-1",
        agentSessionId: "session-1",
        triggerType: SubmissionTriggerType.button,
        conversationSummary: "Submitted for review.",
        workSummary: "Review pending task.",
        artifacts: [],
        selfReflection: "Waiting for feedback.",
        agentEvaluationHints: [],
        submittedAt: oldDate
      }
    });

    await prisma.reviewResult.create({
      data: {
        submissionId: "avatar-submission-reviewing",
        status: ReviewStatus.queued,
        rationale: "AI review queued."
      }
    });

    const response = await get("/agent-avatars/student-3");

    expect(response.status).toBe(200);
    expect(response.body.status).toBe("reviewing");
    expect(response.body.activitySummary).toContain("排队等待");
  });

  it("derives online status when a student has recent memory activity", async () => {
    await prisma.agentMemory.create({
      data: {
        studentId: "student-1",
        type: "observation",
        content: "学生正在浏览课程材料",
        importance: 5.0
      }
    });

    // Clean up the working submission so it doesn't override
    await prisma.reviewResult.deleteMany({
      where: { submission: { studentId: "student-1" } }
    });
    await prisma.agentSubmission.deleteMany({
      where: { studentId: "student-1" }
    });

    const response = await get("/agent-avatars/student-1");

    expect(response.status).toBe(200);
    expect(response.body.status).toBe("online");
    expect(response.body.activitySummary).toContain("浏览课程材料");
  });

  it("filters avatars by zone", async () => {
    const response = await get("/agent-avatars?zone=workstations");

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body)).toBe(true);
    // All avatars should be in the workstations zone
    for (const avatar of response.body) {
      expect(avatar.currentZone).toBe("workstations");
    }
  });

  it("returns offline status for offline students", async () => {
    const response = await get("/agent-avatars/student-2");

    expect(response.status).toBe(200);
    expect(response.body.status).toBe("offline");
    expect(response.body.activitySummary).toBe("离线");
  });

  it("returns 404 for non-existent student", async () => {
    const response = await get("/agent-avatars/non-existent-student");

    expect(response.status).toBe(404);
  });
});
