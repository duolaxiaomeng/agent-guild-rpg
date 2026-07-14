import { spawn } from "node:child_process";
import { isAbsolute, relative, resolve } from "node:path";

const DEFAULT_ALLOWED_COMMANDS = ["pnpm", "npm", "yarn"] as const;
const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;
const MAX_OUTPUT_LENGTH = 50_000;

export type TestExpertEvent = {
  type: "run.started" | "test.completed" | "run.failed";
  dayId: string;
  payload: Record<string, unknown>;
};

export type TestExpertRunInput = {
  runId: string;
  dayId: string;
  command: string;
  args: string[];
  cwd?: string;
};

export type TestExpertRunResult = {
  runId: string;
  dayId: string;
  passed: boolean;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  output: string;
  durationMs: number;
};

export type TestExpertAdapterOptions = {
  workspaceRoot: string;
  allowedCommands?: readonly string[];
  timeoutMs?: number;
  reportEvent?: (event: TestExpertEvent) => void | Promise<void>;
};

export class TestExpertAdapter {
  private readonly workspaceRoot: string;
  private readonly allowedCommands: ReadonlySet<string>;
  private readonly timeoutMs: number;
  private readonly reportEvent?: TestExpertAdapterOptions["reportEvent"];

  constructor(options: TestExpertAdapterOptions) {
    this.workspaceRoot = resolve(options.workspaceRoot);
    this.allowedCommands = new Set(
      options.allowedCommands ?? DEFAULT_ALLOWED_COMMANDS
    );
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.reportEvent = options.reportEvent;
  }

  async run(input: TestExpertRunInput): Promise<TestExpertRunResult> {
    this.assertAllowedCommand(input.command);
    const cwd = this.resolveWorkspacePath(input.cwd);
    await this.emit({
      type: "run.started",
      dayId: input.dayId,
      payload: {
        runId: input.runId,
        command: input.command,
        cwd
      }
    });

    const result = await this.execute(input, cwd);
    const event: TestExpertEvent = {
      type: result.passed ? "test.completed" : "run.failed",
      dayId: input.dayId,
      payload: {
        runId: input.runId,
        passed: result.passed,
        exitCode: result.exitCode,
        signal: result.signal,
        output: result.output,
        durationMs: result.durationMs
      }
    };
    await this.emit(event);

    return result;
  }

  private execute(
    input: TestExpertRunInput,
    cwd: string
  ): Promise<TestExpertRunResult> {
    return new Promise((resolveResult) => {
      const child = spawn(input.command, input.args, {
        cwd,
        shell: false,
        env: process.env
      });
      const chunks: string[] = [];
      const startedAt = Date.now();
      let settled = false;
      let timedOut = false;

      const append = (chunk: Buffer | string) => {
        const remaining = MAX_OUTPUT_LENGTH - chunks.join("").length;
        if (remaining > 0) chunks.push(String(chunk).slice(0, remaining));
      };

      const finish = (exitCode: number | null, signal: NodeJS.Signals | null) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        const output = chunks.join("");
        resolveResult({
          runId: input.runId,
          dayId: input.dayId,
          passed: !timedOut && exitCode === 0,
          exitCode,
          signal,
          output,
          durationMs: Date.now() - startedAt
        });
      };

      const timeout = setTimeout(() => {
        timedOut = true;
        append(`\nTest command timed out after ${this.timeoutMs}ms.`);
        child.kill("SIGTERM");
      }, this.timeoutMs);

      child.stdout.on("data", append);
      child.stderr.on("data", append);
      child.on("error", (error) => {
        append(`\n${error.message}`);
        finish(null, null);
      });
      child.on("close", finish);
    });
  }

  private assertAllowedCommand(command: string) {
    if (isAbsolute(command) || !this.allowedCommands.has(command)) {
      throw new Error(`Test command is not allowed: ${command}`);
    }
  }

  private resolveWorkspacePath(cwd?: string) {
    const resolved = resolve(this.workspaceRoot, cwd ?? ".");
    const relativePath = relative(this.workspaceRoot, resolved);
    const outsideWorkspace =
      relativePath === ".." ||
      relativePath.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) ||
      isAbsolute(relativePath);
    if (outsideWorkspace) {
      throw new Error("Test working directory must stay inside the workspace");
    }
    return resolved;
  }

  private async emit(event: TestExpertEvent) {
    try {
      await this.reportEvent?.(event);
    } catch {
      // Event transport failure must not hide the local test result.
    }
  }
}
