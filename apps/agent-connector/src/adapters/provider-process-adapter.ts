import { spawn } from "node:child_process";
import { realpathSync } from "node:fs";
import { basename, isAbsolute, relative, resolve } from "node:path";

const DEFAULT_ALLOWED_EXECUTABLES = ["codex", "claude"] as const;
const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;
const DEFAULT_TERMINATION_GRACE_MS = 2_000;
const DEFAULT_MAX_OUTPUT_LENGTH = 100_000;

const SENSITIVE_ENV_NAME =
  /(?:^|_)(?:API_?KEY|AUTH|COOKIE|CREDENTIAL|PAIRING_CODE|PASSWORD|SECRET|TOKEN)(?:_|$)/i;

export type ProviderProcessEvent = {
  type: "run.started" | "run.completed" | "run.failed";
  dayId: string;
  payload: Record<string, unknown>;
};

export type ProviderProcessRunInput = {
  runId: string;
  dayId: string;
  instruction: string;
  args?: string[];
  cwd?: string;
  signal?: AbortSignal;
};

export type ProviderProcessRunResult = {
  runId: string;
  dayId: string;
  provider: string;
  succeeded: boolean;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  output: string;
  outputTruncated: boolean;
  timedOut: boolean;
  cancelled: boolean;
  durationMs: number;
};

export type ProviderProcessAdapterOptions = {
  workspaceRoot: string;
  provider: string;
  executable?: string;
  allowedExecutables?: readonly string[];
  timeoutMs?: number;
  terminationGraceMs?: number;
  maxOutputLength?: number;
  sensitiveValues?: readonly string[];
  env?: NodeJS.ProcessEnv;
  reportEvent?: (event: ProviderProcessEvent) => void | Promise<void>;
};

export function defaultExecutableForProvider(provider: string) {
  switch (provider.toLowerCase()) {
    case "codex":
    case "codex-cli":
      return "codex";
    case "claude":
    case "claude-code":
      return "claude";
    default:
      return undefined;
  }
}

export function argumentsForProvider(provider: string, args: readonly string[]) {
  switch (provider.toLowerCase()) {
    case "codex":
    case "codex-cli":
      return ["exec", ...args];
    case "claude":
    case "claude-code":
      return ["--print", ...args];
    default:
      return [...args];
  }
}

export class ProviderProcessAdapter {
  private readonly workspaceRoot: string;
  private readonly provider: string;
  private readonly executable: string;
  private readonly allowedExecutables: ReadonlySet<string>;
  private readonly timeoutMs: number;
  private readonly terminationGraceMs: number;
  private readonly maxOutputLength: number;
  private readonly sensitiveValues: readonly string[];
  private readonly env: NodeJS.ProcessEnv;
  private readonly reportEvent?: ProviderProcessAdapterOptions["reportEvent"];

  constructor(options: ProviderProcessAdapterOptions) {
    this.workspaceRoot = realpathSync(resolve(options.workspaceRoot));
    this.provider = options.provider;
    this.executable =
      options.executable ?? defaultExecutableForProvider(options.provider) ?? "";
    this.allowedExecutables = new Set([
      ...DEFAULT_ALLOWED_EXECUTABLES,
      ...(options.allowedExecutables ?? [])
    ]);
    this.timeoutMs = positiveInteger(options.timeoutMs, DEFAULT_TIMEOUT_MS);
    this.terminationGraceMs = positiveInteger(
      options.terminationGraceMs,
      DEFAULT_TERMINATION_GRACE_MS
    );
    this.maxOutputLength = positiveInteger(
      options.maxOutputLength,
      DEFAULT_MAX_OUTPUT_LENGTH
    );
    this.env = stripConnectorCredentials(options.env ?? process.env);
    this.sensitiveValues = collectSensitiveValues(
      options.sensitiveValues ?? [],
      options.env ?? process.env
    );
    this.reportEvent = options.reportEvent;

    this.assertAllowedExecutable();
  }

  async run(input: ProviderProcessRunInput): Promise<ProviderProcessRunResult> {
    if (!input.instruction.trim()) {
      throw new Error("Provider instruction must not be empty");
    }

    const cwd = this.resolveWorkspacePath(input.cwd);
    const args = this.buildArgs(input.args ?? []);

    await this.emit({
      type: "run.started",
      dayId: input.dayId,
      payload: {
        runId: input.runId,
        provider: this.provider,
        executable: this.executable,
        cwd
      }
    });

    const result = await this.execute(input, args, cwd);
    await this.emit({
      type: result.succeeded ? "run.completed" : "run.failed",
      dayId: input.dayId,
      payload: {
        runId: result.runId,
        provider: result.provider,
        succeeded: result.succeeded,
        exitCode: result.exitCode,
        signal: result.signal,
        output: result.output,
        outputTruncated: result.outputTruncated,
        timedOut: result.timedOut,
        cancelled: result.cancelled,
        durationMs: result.durationMs
      }
    });

    return result;
  }

  private buildArgs(args: string[]) {
    return argumentsForProvider(this.provider, args);
  }

  private execute(
    input: ProviderProcessRunInput,
    args: string[],
    cwd: string
  ): Promise<ProviderProcessRunResult> {
    return new Promise((resolveResult) => {
      const child = spawn(this.executable, args, {
        cwd,
        shell: false,
        env: this.env,
        stdio: ["pipe", "pipe", "pipe"]
      });
      const chunks: string[] = [];
      const startedAt = Date.now();
      let outputLength = 0;
      let outputTruncated = false;
      let settled = false;
      let timedOut = false;
      let cancelled = false;
      let forceKillTimer: NodeJS.Timeout | undefined;

      const append = (chunk: Buffer | string) => {
        const text = String(chunk);
        const remaining = this.maxOutputLength - outputLength;
        if (remaining <= 0) {
          outputTruncated = true;
          return;
        }
        const accepted = text.slice(0, remaining);
        chunks.push(accepted);
        outputLength += accepted.length;
        if (accepted.length < text.length) outputTruncated = true;
      };

      const finish = (exitCode: number | null, signal: NodeJS.Signals | null) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutTimer);
        if (forceKillTimer) clearTimeout(forceKillTimer);
        input.signal?.removeEventListener("abort", handleAbort);

        const rawOutput = `${chunks.join("")}${
          outputTruncated ? "\n[output truncated]" : ""
        }`;
        resolveResult({
          runId: input.runId,
          dayId: input.dayId,
          provider: this.provider,
          succeeded: !timedOut && !cancelled && exitCode === 0,
          exitCode,
          signal,
          output: redactSensitiveText(rawOutput, this.sensitiveValues),
          outputTruncated,
          timedOut,
          cancelled,
          durationMs: Date.now() - startedAt
        });
      };

      const terminate = (message: string) => {
        if (settled) return;
        append(message);
        child.kill("SIGTERM");
        if (!forceKillTimer) {
          forceKillTimer = setTimeout(() => {
            if (!settled) child.kill("SIGKILL");
          }, this.terminationGraceMs);
        }
      };

      const handleAbort = () => {
        cancelled = true;
        terminate("\nProvider process termination requested.");
      };

      const timeoutTimer = setTimeout(() => {
        timedOut = true;
        terminate(`\nProvider process timed out after ${this.timeoutMs}ms.`);
      }, this.timeoutMs);

      child.stdout.on("data", append);
      child.stderr.on("data", append);
      child.on("error", (error) => {
        append(`\nProvider process failed to start: ${error.message}`);
        finish(null, null);
      });
      child.on("close", finish);
      child.stdin.on("error", () => {
        // The child may close stdin before consuming the full instruction.
      });
      input.signal?.addEventListener("abort", handleAbort, { once: true });
      if (input.signal?.aborted) handleAbort();
      child.stdin.end(input.instruction);
    });
  }

  private assertAllowedExecutable() {
    if (
      !this.executable ||
      isAbsolute(this.executable) ||
      basename(this.executable) !== this.executable ||
      !this.allowedExecutables.has(this.executable)
    ) {
      throw new Error(
        `Provider executable is not allowed: ${this.executable || "<missing>"}`
      );
    }
  }

  private resolveWorkspacePath(cwd?: string) {
    const resolved = realpathSync(resolve(this.workspaceRoot, cwd ?? "."));
    const relativePath = relative(this.workspaceRoot, resolved);
    if (
      relativePath === ".." ||
      relativePath.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) ||
      isAbsolute(relativePath)
    ) {
      throw new Error("Provider working directory must stay inside the workspace");
    }
    return resolved;
  }

  private async emit(event: ProviderProcessEvent) {
    try {
      await this.reportEvent?.(event);
    } catch {
      // Event transport failure must not hide or stop the local provider process.
    }
  }
}

export function redactSensitiveText(
  value: string,
  sensitiveValues: readonly string[] = []
) {
  let redacted = value
    .replace(
      /\b(Bearer\s+)[A-Za-z0-9._~+/=-]+/gi,
      (_match, prefix: string) => `${prefix}[REDACTED]`
    )
    .replace(
      /\b((?:api[_-]?key|cookie|password|secret|token)\s*[:=]\s*)[^\s,;]+/gi,
      (_match, prefix: string) => `${prefix}[REDACTED]`
    )
    .replace(/\b(?:sk-ant-|sk-|gh[opusr]_)[A-Za-z0-9_-]{8,}\b/g, "[REDACTED]");

  for (const sensitiveValue of sensitiveValues) {
    if (sensitiveValue.length < 4) continue;
    redacted = redacted.split(sensitiveValue).join("[REDACTED]");
  }

  return redacted;
}

function stripConnectorCredentials(env: NodeJS.ProcessEnv) {
  return Object.fromEntries(
    Object.entries(env).filter(([name]) => !name.startsWith("AGENT_GUILD_"))
  );
}

function collectSensitiveValues(
  providedValues: readonly string[],
  env: NodeJS.ProcessEnv
) {
  const environmentValues = Object.entries(env)
    .filter(([name, value]) => SENSITIVE_ENV_NAME.test(name) && value)
    .map(([, value]) => value as string);
  return [...new Set([...providedValues, ...environmentValues])];
}

function positiveInteger(value: number | undefined, fallback: number) {
  return value !== undefined && Number.isInteger(value) && value > 0
    ? value
    : fallback;
}
