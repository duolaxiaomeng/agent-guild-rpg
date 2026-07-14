import { describe, expect, it, vi } from "vitest";
import { PrismaAgentRunStatePersistence } from "../src/modules/agent-orchestration/prisma-agent-run-state.persistence";

describe("PrismaAgentRunStatePersistence", () => {
  it("upserts state transitions and restores valid snapshots", async () => {
    const upsert = vi.fn().mockResolvedValue(undefined);
    const findMany = vi.fn().mockResolvedValue([
      {
        runId: "run-1",
        status: "paused",
        input: { task: "review" },
        dependencies: ["parent"],
        result: null,
        error: null
      }
    ]);
    const persistence = new PrismaAgentRunStatePersistence({
      agentRunSnapshot: { upsert, findMany }
    } as never);

    await persistence.save({
      previousStatus: "queued",
      run: {
        runId: "run-1",
        status: "running",
        dependencies: ["parent"],
        input: { task: "review" }
      }
    });

    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { runId: "run-1" },
      create: expect.objectContaining({
        runId: "run-1",
        status: "running",
        dependencies: ["parent"]
      })
    }));
    await expect(persistence.load()).resolves.toEqual([
      {
        runId: "run-1",
        status: "paused",
        dependencies: ["parent"],
        input: { task: "review" }
      }
    ]);
  });
});
