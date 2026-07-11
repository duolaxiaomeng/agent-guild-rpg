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
  });
});
