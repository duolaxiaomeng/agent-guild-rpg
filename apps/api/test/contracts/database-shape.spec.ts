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

  it("seeds a starter course world scenario", () => {
    const seed = readFileSync(resolve(process.cwd(), "prisma/seed.ts"), "utf8");

    expect(seed).toContain("one teacher");
    expect(seed).toContain("three students");
    expect(seed).toContain("one guild");
    expect(seed).toContain("day quests");
    expect(seed).toContain("session-1");
  });
});
