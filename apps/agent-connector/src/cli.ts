import { AgentConnectorClient } from "./client.js";
import { ProviderProcessAdapter } from "./adapters/provider-process-adapter.js";
import { TestExpertAdapter } from "./adapters/test-expert-adapter.js";
import { AgentTaskWorker } from "./task-worker.js";
import { selectAgentRole } from "./role-selector.js";

const connectionCredential = process.env.AGENT_GUILD_CONNECTION_CREDENTIAL;

if (!connectionCredential) {
  console.error("AGENT_GUILD_CONNECTION_CREDENTIAL is required");
  process.exitCode = 1;
} else {
  const run = async () => {
    const provider = process.env.AGENT_GUILD_PROVIDER ?? "codex-cli";
    const workspaceRoot = process.env.AGENT_GUILD_WORKSPACE ?? process.cwd();
    const roleKey = await selectAgentRole({
      provider,
      workspaceRoot,
      override: process.env.AGENT_GUILD_ROLE_KEY,
      fallback: "qa",
      onFallback: (reason) => {
        console.warn(
          `Agent role selection unavailable (${reason}); using deterministic fallback role: qa`,
        );
      },
      executable: process.env.AGENT_GUILD_PROVIDER_EXECUTABLE,
      allowedExecutables: readCsv("AGENT_GUILD_PROVIDER_EXECUTABLE_ALLOWLIST"),
      timeoutMs: readPositiveInteger("AGENT_GUILD_ROLE_SELECTION_TIMEOUT_MS"),
      sensitiveValues: [connectionCredential],
    });
    const client = new AgentConnectorClient({
      connectionCredential,
      provider,
      clientName: process.env.AGENT_GUILD_CLIENT_NAME ?? "local-agent",
      capabilities: (
        process.env.AGENT_GUILD_CAPABILITIES ??
        "events,agent-task,provider-process"
      )
        .split(",")
        .map((capability) => capability.trim())
        .filter(Boolean),
      roleKey,
      requestTimeoutMs: readPositiveInteger("AGENT_GUILD_REQUEST_TIMEOUT_MS"),
      heartbeatMaxRetries: readNonNegativeInteger(
        "AGENT_GUILD_HEARTBEAT_MAX_RETRIES"
      ),
      retryDelayMs: readNonNegativeInteger("AGENT_GUILD_RETRY_DELAY_MS")
    });
    const profile = await client.connect();
    console.log(
      JSON.stringify({
        connectorId: profile.connectorId,
        provider: profile.provider,
        status: profile.status,
        capabilities: profile.capabilities,
        roleKey: profile.roleKey,
        visualRole: profile.visualRole,
      })
    );

    const testCommand = process.env.AGENT_GUILD_TEST_COMMAND;
    if (testCommand) {
      const adapter = new TestExpertAdapter({
        workspaceRoot: process.env.AGENT_GUILD_WORKSPACE ?? process.cwd(),
        reportEvent: async (event) => {
          await client.recordEvent({
            dayId: process.env.AGENT_GUILD_DAY_ID ?? "day-1",
            type: event.type,
            payload: event.payload
          });
        }
      });
      const result = await adapter.run({
        runId: `qa-${Date.now()}`,
        dayId: process.env.AGENT_GUILD_DAY_ID ?? "day-1",
        command: testCommand,
        args: (process.env.AGENT_GUILD_TEST_ARGS ?? "").split(" ").filter(Boolean),
        cwd: process.env.AGENT_GUILD_TEST_CWD
      });
      await client.heartbeat("offline");
      process.exitCode = result.passed ? 0 : 1;
      return;
    }

    const instruction = process.env.AGENT_GUILD_RUN_INSTRUCTION;
    if (instruction) {
      const dayId = process.env.AGENT_GUILD_DAY_ID ?? "day-1";
      const adapter = new ProviderProcessAdapter({
        workspaceRoot: process.env.AGENT_GUILD_WORKSPACE ?? process.cwd(),
        provider: process.env.AGENT_GUILD_PROVIDER ?? "codex-cli",
        executable: process.env.AGENT_GUILD_PROVIDER_EXECUTABLE,
        allowedExecutables: readCsv("AGENT_GUILD_PROVIDER_EXECUTABLE_ALLOWLIST"),
        timeoutMs: readPositiveInteger("AGENT_GUILD_RUN_TIMEOUT_MS"),
        terminationGraceMs: readPositiveInteger(
          "AGENT_GUILD_TERMINATION_GRACE_MS"
        ),
        maxOutputLength: readPositiveInteger("AGENT_GUILD_MAX_OUTPUT_LENGTH"),
        sensitiveValues: [connectionCredential, client.connectorToken ?? ""],
        reportEvent: async (event) => {
          await client.recordEvent({
            dayId,
            type: event.type,
            payload: event.payload
          });
        }
      });

      const stopHeartbeat = startHeartbeat(client);
      const runAbortController = new AbortController();
      const requestStop = () => runAbortController.abort();
      process.once("SIGINT", requestStop);
      process.once("SIGTERM", requestStop);
      try {
        const result = await adapter.run({
          runId: process.env.AGENT_GUILD_RUN_ID ?? `agent-${Date.now()}`,
          dayId,
          instruction,
          args: readJsonStringArray("AGENT_GUILD_PROVIDER_ARGS_JSON"),
          cwd: process.env.AGENT_GUILD_RUN_CWD,
          signal: runAbortController.signal
        });
        console.log(
          JSON.stringify({
            runId: result.runId,
            provider: result.provider,
            status: result.succeeded ? "completed" : "failed",
            exitCode: result.exitCode,
            timedOut: result.timedOut,
            cancelled: result.cancelled,
            outputTruncated: result.outputTruncated
          })
        );
        process.exitCode = result.succeeded ? 0 : 1;
      } finally {
        process.removeListener("SIGINT", requestStop);
        process.removeListener("SIGTERM", requestStop);
        stopHeartbeat();
        await client.heartbeat("offline").catch(reportHeartbeatError);
      }
      return;
    }

    const adapter = new ProviderProcessAdapter({
      workspaceRoot: process.env.AGENT_GUILD_WORKSPACE ?? process.cwd(),
      provider: process.env.AGENT_GUILD_PROVIDER ?? "codex-cli",
      executable: process.env.AGENT_GUILD_PROVIDER_EXECUTABLE,
      allowedExecutables: readCsv("AGENT_GUILD_PROVIDER_EXECUTABLE_ALLOWLIST"),
      timeoutMs: readPositiveInteger("AGENT_GUILD_RUN_TIMEOUT_MS"),
      terminationGraceMs: readPositiveInteger(
        "AGENT_GUILD_TERMINATION_GRACE_MS"
      ),
      maxOutputLength: readPositiveInteger("AGENT_GUILD_MAX_OUTPUT_LENGTH"),
      sensitiveValues: [connectionCredential, client.connectorToken ?? ""],
      reportEvent: async (event) => {
        await client.recordEvent({
          dayId: event.dayId,
          type: event.type,
          payload: event.payload
        });
      }
    });
    const worker = new AgentTaskWorker({
      client,
      adapter,
      lightCapacity: readNonNegativeInteger("AGENT_GUILD_LIGHT_CAPACITY"),
      heavyCapacity: readNonNegativeInteger("AGENT_GUILD_HEAVY_CAPACITY"),
      waitSeconds: readNonNegativeInteger("AGENT_GUILD_CLAIM_WAIT_SECONDS"),
      log: (message, details) => console.log(JSON.stringify({ message, ...details }))
    });
    const stopHeartbeat = startHeartbeat(client);
    const shutdown = new AbortController();
    let shutdownSignal: NodeJS.Signals | undefined;
    const requestStop = (signal: NodeJS.Signals) => {
      shutdownSignal = signal;
      shutdown.abort(new Error(`Connector received ${signal}`));
    };

    process.once("SIGINT", requestStop);
    process.once("SIGTERM", requestStop);
    try {
      await worker.run(shutdown.signal);
    } finally {
      process.removeListener("SIGINT", requestStop);
      process.removeListener("SIGTERM", requestStop);
      stopHeartbeat();
      await client.heartbeat("offline").catch(reportHeartbeatError);
      if (shutdownSignal) {
        process.exitCode = shutdownSignal === "SIGINT" ? 130 : 143;
      }
    }
  };

  run().catch((error: unknown) => {
    console.error(
      `Agent connector failed: ${error instanceof Error ? error.message : String(error)}`
    );
    process.exitCode = 1;
  });
}

function readCsv(name: string) {
  return (process.env[name] ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

function startHeartbeat(client: AgentConnectorClient) {
  let stopped = false;
  let heartbeatTimer: NodeJS.Timeout | undefined;
  const schedule = () => {
    if (stopped) return;
    heartbeatTimer = setTimeout(() => {
      client.heartbeat().catch(reportHeartbeatError).finally(schedule);
    }, randomHeartbeatDelayMs());
  };
  schedule();
  return () => {
    stopped = true;
    if (heartbeatTimer) clearTimeout(heartbeatTimer);
  };
}

function randomHeartbeatDelayMs() {
  return 25_000 + Math.floor(Math.random() * 10_001);
}

function reportHeartbeatError(error: unknown) {
  console.error(
    `Agent connector heartbeat failed: ${
      error instanceof Error ? error.message : String(error)
    }`
  );
}

function readJsonStringArray(name: string) {
  const value = process.env[name];
  if (!value) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error(`${name} must be a JSON string array`);
  }
  if (!Array.isArray(parsed) || parsed.some((item) => typeof item !== "string")) {
    throw new Error(`${name} must be a JSON string array`);
  }
  return parsed as string[];
}

function readPositiveInteger(name: string) {
  return readInteger(name, 1);
}

function readNonNegativeInteger(name: string) {
  return readInteger(name, 0);
}

function readInteger(name: string, minimum: number) {
  const value = process.env[name];
  if (value === undefined || value === "") return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum) {
    throw new Error(`${name} must be an integer greater than or equal to ${minimum}`);
  }
  return parsed;
}
