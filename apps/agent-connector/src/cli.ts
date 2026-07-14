import { AgentConnectorClient } from "./client.js";
import { ProviderProcessAdapter } from "./adapters/provider-process-adapter.js";
import { TestExpertAdapter } from "./adapters/test-expert-adapter.js";

const connectionCredential = process.env.AGENT_GUILD_CONNECTION_CREDENTIAL;

if (!connectionCredential) {
  console.error("AGENT_GUILD_CONNECTION_CREDENTIAL is required");
  process.exitCode = 1;
} else {
  const client = new AgentConnectorClient({
    connectionCredential,
    provider: process.env.AGENT_GUILD_PROVIDER ?? "codex-cli",
    clientName: process.env.AGENT_GUILD_CLIENT_NAME ?? "local-agent",
    capabilities: (process.env.AGENT_GUILD_CAPABILITIES ?? "events")
      .split(",")
      .map((capability) => capability.trim())
      .filter(Boolean),
    requestTimeoutMs: readPositiveInteger("AGENT_GUILD_REQUEST_TIMEOUT_MS"),
    heartbeatMaxRetries: readNonNegativeInteger(
      "AGENT_GUILD_HEARTBEAT_MAX_RETRIES"
    ),
    retryDelayMs: readNonNegativeInteger("AGENT_GUILD_RETRY_DELAY_MS")
  });

  const run = async () => {
    const profile = await client.connect();
    console.log(
      JSON.stringify({
        connectorId: profile.connectorId,
        provider: profile.provider,
        status: profile.status,
        capabilities: profile.capabilities
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

    const stopHeartbeat = startHeartbeat(client);

    const stop = () => {
      stopHeartbeat();
      client.heartbeat("offline").finally(() => process.exit(0));
    };

    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
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
  const heartbeatTimer = setInterval(() => {
    client.heartbeat().catch(reportHeartbeatError);
  }, 30_000);
  return () => clearInterval(heartbeatTimer);
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
