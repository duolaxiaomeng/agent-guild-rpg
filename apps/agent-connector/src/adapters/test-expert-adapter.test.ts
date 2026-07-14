import { describe, expect, it } from "vitest";
import { TestExpertAdapter } from "./test-expert-adapter.js";

describe("TestExpertAdapter", () => {
  it("runs an allowed package-manager command and emits normalized events", async () => {
    const events: Array<{ type: string; payload: Record<string, unknown> }> = [];
    const adapter = new TestExpertAdapter({
      workspaceRoot: process.cwd(),
      reportEvent: async (event) => {
        events.push(event);
      }
    });

    const result = await adapter.run({
      runId: "qa-run-1",
      dayId: "day-1",
      command: "pnpm",
      args: ["--version"]
    });

    expect(result.passed).toBe(true);
    expect(result.exitCode).toBe(0);
    expect(events.map((event) => event.type)).toEqual([
      "run.started",
      "test.completed"
    ]);
    expect(events[1]?.payload).toMatchObject({
      runId: "qa-run-1",
      passed: true
    });
  });

  it("reports a failed test command without throwing away its output", async () => {
    const events: Array<{ type: string; payload: Record<string, unknown> }> = [];
    const adapter = new TestExpertAdapter({
      workspaceRoot: process.cwd(),
      reportEvent: (event) => {
        events.push(event);
      }
    });

    const result = await adapter.run({
      runId: "qa-run-2",
      dayId: "day-1",
      command: "pnpm",
      args: ["exec", "node", "-e", "process.stdout.write('failure-output'); process.exit(2)"]
    });

    expect(result.passed).toBe(false);
    expect(result.exitCode).toBe(2);
    expect(result.output).toContain("failure-output");
    expect(events.at(-1)).toMatchObject({
      type: "run.failed",
      payload: { runId: "qa-run-2", passed: false, exitCode: 2 }
    });
  });

  it("rejects commands outside the package-manager allowlist", async () => {
    const adapter = new TestExpertAdapter({ workspaceRoot: process.cwd() });

    await expect(
      adapter.run({
        runId: "qa-run-3",
        dayId: "day-1",
        command: "sh",
        args: ["-c", "echo should-not-run"]
      })
    ).rejects.toThrow(/not allowed/i);
  });
});
