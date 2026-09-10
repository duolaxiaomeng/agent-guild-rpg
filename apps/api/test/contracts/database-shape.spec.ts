import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("prisma database shape", () => {
  it("contains the core teaching world models", () => {
    const schema = readFileSync(resolve(process.cwd(), "prisma/schema.prisma"), "utf8");

    expect(schema).toContain("model CourseWorld");
    expect(schema).toContain("model Homestead");
    expect(schema).toContain("model Guild");
    expect(schema).toContain("model GuildMembership");
    expect(schema).toContain("model QuestDay");
    expect(schema).toContain("model AgentSession");
    expect(schema).toContain("model AgentSubmission");
    expect(schema).toContain("model ReviewResult");
    expect(schema).toContain("model ContributionLog");
    expect(schema).toContain("artifacts");
    expect(schema).toContain("agentEvaluationHints");
    expect(schema).toContain("submittedAt");
  });

  it("contains the classroom control center shape", () => {
    const schema = readFileSync(resolve(process.cwd(), "prisma/schema.prisma"), "utf8");

    expect(schema).toContain("enum ClassroomSessionStatus");
    expect(schema).toContain("enum ClassroomStageStatus");
    expect(schema).toContain("enum ClassroomStaffRole");
    expect(schema).toContain("enum HelpRequestStatus");
    expect(schema).toContain("enum ClassroomEventType");
    expect(schema).toContain("model ClassroomSession");
    expect(schema).toContain("model ClassroomStage");
    expect(schema).toContain("model ClassroomStaffAssignment");
    expect(schema).toContain("model HelpRequest");
    expect(schema).toContain("model ClassroomEvent");
    expect(schema).toContain("@@index([sessionId, sortOrder])");
    expect(schema).toContain("@@index([sessionId, status, createdAt])");
    expect(schema).toContain("@@index([sessionId, createdAt])");
  });

  it("contains teacher-published daily homework fields", () => {
    const schema = readFileSync(resolve(process.cwd(), "prisma/schema.prisma"), "utf8");
    const questDayModel = schema.match(/model QuestDay \{[\s\S]*?\n\}/)?.[0] ?? "";

    expect(questDayModel).toMatch(/description\s+String/);
    expect(questDayModel).toMatch(/homework\s+String/);
    expect(questDayModel).toMatch(/acceptanceCriteria\s+Json/);
    expect(questDayModel).toMatch(/dueAt\s+DateTime\?/);
    expect(questDayModel).toMatch(/publishedAt\s+DateTime\?/);
    expect(questDayModel).toMatch(/teacherId\s+String\?/);
    expect(questDayModel).toContain('@relation("QuestDayTeacher"');
    expect(questDayModel).toContain("@@index([courseWorldId, publishedAt])");
    expect(questDayModel).toContain("@@index([teacherId, publishedAt])");
  });

  it("contains scoped agent memory fields and lookup indexes", () => {
    const schema = readFileSync(resolve(process.cwd(), "prisma/schema.prisma"), "utf8");

    expect(schema).toContain("courseWorldId  String?");
    expect(schema).toContain("roomId         String?");
    expect(schema).toContain("agentSessionId String?");
    expect(schema).toContain("taskId         String?");
    expect(schema).toContain("@@index([studentId, courseWorldId])");
    expect(schema).toContain("@@index([studentId, roomId])");
    expect(schema).toContain("@@index([studentId, agentSessionId])");
    expect(schema).toContain("@@index([studentId, taskId])");
  });

  it("contains persistent Agent orchestration snapshots", () => {
    const schema = readFileSync(resolve(process.cwd(), "prisma/schema.prisma"), "utf8");

    expect(schema).toContain("model AgentRunSnapshot");
    expect(schema).toContain("runId          String   @id");
    expect(schema).toContain("dependencies   Json");
    expect(schema).toContain("@@index([status, updatedAt])");
  });

  it("contains durable connector tasks, dependencies, leases and attempts", () => {
    const schema = readFileSync(resolve(process.cwd(), "prisma/schema.prisma"), "utf8");

    expect(schema).toContain("enum AgentTaskStatus");
    expect(schema).toContain("enum AgentTaskResourceClass");
    expect(schema).toContain("model AgentTask");
    expect(schema).toContain("model AgentTaskDependency");
    expect(schema).toContain("model AgentTaskAttempt");
    expect(schema).toContain("requiredCapabilities Json");
    expect(schema).toContain("blockedByCount");
    expect(schema).toMatch(/runId\s+String\s+@unique/);
    expect(schema).toMatch(/heavyLeaseKey\s+String\?\s+@unique/);
    expect(schema).toContain("leaseTokenHash");
    expect(schema).toContain("leaseExpiresAt");
    expect(schema).toContain("@@index([status, resourceClass, availableAt, priority])");
    expect(schema).toContain("@@unique([taskId, dependencyTaskId])");
    expect(schema).toContain("@@unique([taskId, attemptNumber])");
  });

  it("contains persistent private Agent workstation state", () => {
    const schema = readFileSync(resolve(process.cwd(), "prisma/schema.prisma"), "utf8");
    const worldState = schema.match(/model AgentWorldState \{[\s\S]*?\n\}/)?.[0] ?? "";

    expect(schema).toContain("model AgentWorldState");
    expect(worldState).toMatch(/studentId\s+String\s+@unique/);
    expect(worldState).toMatch(/currentZone\s+String/);
    expect(worldState).toMatch(/positionX\s+Float/);
    expect(worldState).toMatch(/positionY\s+Float/);
    expect(worldState).toMatch(/facing\s+String/);
    expect(worldState).toMatch(/revision\s+Int/);
  });

  it("contains idempotency and classroom hot-path constraints", () => {
    const schema = readFileSync(resolve(process.cwd(), "prisma/schema.prisma"), "utf8");
    const membership = schema.match(/model GuildMembership \{[\s\S]*?\n\}/)?.[0] ?? "";
    const event = schema.match(/model AgentEvent \{[\s\S]*?\n\}/)?.[0] ?? "";
    const submission = schema.match(/model AgentSubmission \{[\s\S]*?\n\}/)?.[0] ?? "";

    expect(schema).toMatch(/enum MembershipStatus \{[\s\S]*?declined[\s\S]*?\}/);
    expect(schema).toMatch(/enum ReviewStatus \{[\s\S]*?needs_teacher[\s\S]*?\}/);
    expect(membership).toContain("invitedById");
    expect(membership).toContain("invitedAt");
    expect(membership).toContain("respondedAt");
    expect(event).toMatch(/eventId\s+String\s+@unique/);
    expect(submission).toContain("clientRequestId");
    expect(submission).toContain("pendingReviewKey");
    expect(submission).toContain("@@unique([studentId, clientRequestId])");
    expect(submission).toContain("@@index([studentId, dayId, submittedAt])");
    expect(schema).toContain("@@index([granteeId, status, expiresAt])");
    expect(schema).toContain("@@index([status, decidedAt])");
    expect(schema).toContain("@@index([expiresAt])");

    const migration = readFileSync(
      resolve(
        process.cwd(),
        "prisma/migrations/20260714100000_multi_agent_classroom_hardening/migration.sql"
      ),
      "utf8"
    );
    expect(migration).toContain("GuildMembership_one_active_guild_per_student_key");
    expect(migration).toContain('WHERE "status" = \'active\'');
  });

  it("contains Day website lottery options and one draw per student", () => {
    const schema = readFileSync(resolve(process.cwd(), "prisma/schema.prisma"), "utf8");

    expect(schema).toContain("model WebsiteLotteryOption");
    expect(schema).toContain("model WebsiteLotteryDraw");
    expect(schema).toContain("createdById String");
    expect(schema).toContain("@@unique([dayId, studentId])");
    expect(schema).toContain("@@unique([dayId, optionId])");
    expect(schema).toContain("@@index([dayId, isActive, sortOrder])");
  });

  it("seeds a starter course world scenario", () => {
    const seed = readFileSync(resolve(process.cwd(), "prisma/seed.ts"), "utf8");

    expect(seed).toContain("one teacher");
    expect(seed).toContain("three students");
    expect(seed).toContain("one guild");
    expect(seed).toContain("day quests");
    expect(seed).toContain("session-1");
    expect(seed).toContain("classroom-session-1");
    expect(seed).toContain("classroom-stage-briefing");
    expect(seed).toContain("classroomStaffAssignments");
    expect(seed).toContain('userId: "student-3"');
    expect(seed).toContain("acceptanceCriteria");
    expect(seed).toContain("连接自己的 Agent");
    expect(seed).toContain("迭代 Prompt");
    expect(seed).toContain("websiteLotteryOptions");
    expect(seed).toContain("小红书笔记网站");
    expect(seed).toContain("自定义网站主题");
  });
});
