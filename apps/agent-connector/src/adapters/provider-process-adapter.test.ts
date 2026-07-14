import { describe, expect, it } from "vitest";
import {
  ProviderProcessAdapter,
  argumentsForProvider,
  defaultExecutableForProvider,
  redactSensitiveText
} from "./provider-process-adapter.js";

describe("ProviderProcessAdapter", () => {
  it("maps Codex and Claude provider aliases to their executables", () => {
    expect(defaultExecutableForProvider("codex-cli")).toBe("codex");
    expect(defaultExecutableForProvider("claude-code")).toBe("claude");
    expect(defaultExecutableForProvider("another-provider")).toBeUndefined();
    expect(argumentsForProvider("codex-cli", ["--json"])).toEqual([
      "exec",
      "--json"
    ]);
    expect(argumentsForProvider("claude-code", ["--model", "sonnet"])).toEqual([
      "--print",
      "--model",
      "sonnet"
    ]);
  });

  it("runs an allowlisted custom provider without a shell and emits completed events", async () => {
    const events: Array<{ type: string; payload: Record<string, unknown> }> = [];
    const secret = "connector-secret-value";
    const adapter = new ProviderProcessAdapter({
      workspaceRoot: process.cwd(),
      provider: "test-provider",
      executable: "node",
      allowedExecutables: ["node"],
      sensitiveValues: [secret],
      env: {
        ...process.env,
        AGENT_GUILD_CONNECTION_CREDENTIAL: "credential-must-not-reach-child",
        UNIT_TEST_API_TOKEN: secret
      },
      reportEvent: (event) => {
        events.push(event);
      }
    });

    const result = await adapter.run({
      runId: "provider-run-1",
      dayId: "day-1",
      instruction: "inspect this project",
      args: [
        "-e",
        [
          "let input = '';",
          "process.stdin.on('data', chunk => input += chunk);",
          "process.stdin.on('end', () => process.stdout.write(",
          "  'token=' + process.env.UNIT_TEST_API_TOKEN +",
          "  ';credential=' + String(process.env.AGENT_GUILD_CONNECTION_CREDENTIAL) +",
          "  ';input=' + input",
          "))"
        ].join(" ")
      ]
    });

    expect(result.succeeded).toBe(true);
    expect(result.output).toContain("token=[REDACTED]");
    expect(result.output).toContain("credential=undefined");
    expect(result.output).toContain("input=inspect this project");
    expect(result.output).not.toContain(secret);
    expect(events.map((event) => event.type)).toEqual([
      "run.started",
      "run.completed"
    ]);
    expect(events.at(-1)?.payload).toMatchObject({
      runId: "provider-run-1",
      succeeded: true,
      timedOut: false
    });
  });

  it("reports non-zero exits as run.failed and preserves capped output", async () => {
    const events: Array<{ type: string; payload: Record<string, unknown> }> = [];
    const adapter = new ProviderProcessAdapter({
      workspaceRoot: process.cwd(),
      provider: "test-provider",
      executable: "node",
      allowedExecutables: ["node"],
      maxOutputLength: 40,
      reportEvent: (event) => {
        events.push(event);
      }
    });

    const result = await adapter.run({
      runId: "provider-run-2",
      dayId: "day-1",
      instruction: "fail safely",
      args: [
        "-e",
        "process.stdout.write('failure-' + 'x'.repeat(100)); process.exit(2)"
      ]
    });

    expect(result.succeeded).toBe(false);
    expect(result.exitCode).toBe(2);
    expect(result.outputTruncated).toBe(true);
    expect(result.output).toContain("failure-");
    expect(result.output).toContain("[output truncated]");
    expect(events.at(-1)).toMatchObject({
      type: "run.failed",
      payload: {
        runId: "provider-run-2",
        succeeded: false,
        exitCode: 2,
        outputTruncated: true
      }
    });
  });

  it("terminates a provider process after its timeout", async () => {
    const adapter = new ProviderProcessAdapter({
      workspaceRoot: process.cwd(),
      provider: "test-provider",
      executable: "node",
      allowedExecutables: ["node"],
      timeoutMs: 50,
      terminationGraceMs: 50
    });

    const result = await adapter.run({
      runId: "provider-run-timeout",
      dayId: "day-1",
      instruction: "keep running",
      args: ["-e", "setInterval(() => {}, 1_000)"]
    });

    expect(result.succeeded).toBe(false);
    expect(result.timedOut).toBe(true);
    expect(result.cancelled).toBe(false);
    expect(result.output).toContain("timed out after 50ms");
  });

  it("terminates a provider process when the caller aborts the run", async () => {
    const controller = new AbortController();
    const adapter = new ProviderProcessAdapter({
      workspaceRoot: process.cwd(),
      provider: "test-provider",
      executable: "node",
      allowedExecutables: ["node"],
      timeoutMs: 5_000,
      terminationGraceMs: 50
    });

    setTimeout(() => controller.abort(), 30);
    const result = await adapter.run({
      runId: "provider-run-cancelled",
      dayId: "day-1",
      instruction: "keep running",
      args: ["-e", "setInterval(() => {}, 1_000)"],
      signal: controller.signal
    });

    expect(result.succeeded).toBe(false);
    expect(result.timedOut).toBe(false);
    expect(result.cancelled).toBe(true);
    expect(result.output).toContain("termination requested");
  });

  it("rejects executables outside the explicit allowlist and cwd escapes", async () => {
    expect(
      () =>
        new ProviderProcessAdapter({
          workspaceRoot: process.cwd(),
          provider: "custom",
          executable: "sh"
        })
    ).toThrow(/not allowed/i);

    const adapter = new ProviderProcessAdapter({
      workspaceRoot: process.cwd(),
      provider: "test-provider",
      executable: "node",
      allowedExecutables: ["node"]
    });
    await expect(
      adapter.run({
        runId: "provider-run-outside",
        dayId: "day-1",
        instruction: "do not run",
        cwd: "../"
      })
    ).rejects.toThrow(/inside the workspace/i);
  });

  it("redacts common credentials from process output", () => {
    expect(
      redactSensitiveText(
        "Authorization: Bearer abc.def token=visible sk-ant-1234567890",
        ["visible"]
      )
    ).toBe(
      "Authorization: Bearer [REDACTED] token=[REDACTED] [REDACTED]"
    );
  });
});
