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
    expect(seed).toContain("Agent 小红书笔记网站");
    expect(seed).toContain("Agent 自定义主题");
  });
});
