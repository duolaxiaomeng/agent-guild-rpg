import type {
  AgentConnectorClient,
  AgentConnectorTask,
  AgentTaskClaimRequest,
  AgentTaskLease
} from "./client.js";
import type {
  ProviderProcessAdapter,
  ProviderProcessRunInput,
  ProviderProcessRunResult
} from "./adapters/provider-process-adapter.js";

const DEFAULT_IDLE_DELAY_MS = 250;
const MAX_FAILURE_MESSAGE_LENGTH = 8_000;

type TaskClient = Pick<
  AgentConnectorClient,
  "claimTask" | "heartbeatTask" | "completeTask" | "failTask"
>;

type TaskAdapter = Pick<ProviderProcessAdapter, "run">;

export type AgentTaskWorkerOptions = {
  client: TaskClient;
  adapter: TaskAdapter;
  lightCapacity?: number;
  heavyCapacity?: number;
  waitSeconds?: number;
  idleDelayMs?: number;
  log?: (message: string, details?: Record<string, unknown>) => void;
};

export class AgentTaskWorker {
  private readonly client: TaskClient;
  private readonly adapter: TaskAdapter;
  private readonly claimRequest: AgentTaskClaimRequest;
  private readonly idleDelayMs: number;
  private readonly log: NonNullable<AgentTaskWorkerOptions["log"]>;

  constructor(options: AgentTaskWorkerOptions) {
    this.client = options.client;
    this.adapter = options.adapter;
    this.claimRequest = {
      lightCapacity: options.lightCapacity ?? 1,
      heavyCapacity: options.heavyCapacity ?? 1,
      waitSeconds: options.waitSeconds ?? 25
    };
    this.idleDelayMs = nonNegativeInteger(
      options.idleDelayMs,
      DEFAULT_IDLE_DELAY_MS
    );
    this.log = options.log ?? (() => undefined);
  }

  async run(signal: AbortSignal): Promise<void> {
    while (!signal.aborted) {
      let lease: AgentTaskLease | null;
      try {
        lease = await this.client.claimTask(this.claimRequest, signal);
      } catch (error) {
        if (signal.aborted) break;
        this.log("task.claim.failed", { error: errorMessage(error) });
        await abortableDelay(this.idleDelayMs, signal);
        continue;
      }

      if (!lease) {
        await abortableDelay(this.idleDelayMs, signal);
        continue;
      }

      try {
        await this.executeLease(lease, signal);
      } catch (error) {
        if (!signal.aborted) {
          this.log("task.execution.failed", {
            taskId: lease.task.id,
            runId: lease.task.runId,
            error: errorMessage(error)
          });
        }
      }
    }
  }

  private async executeLease(lease: AgentTaskLease, shutdownSignal: AbortSignal) {
    let runInput: ProviderProcessRunInput;
    try {
      runInput = taskRunInput(lease.task);
    } catch (error) {
      await this.client.failTask(
        lease.task.id,
        lease.leaseToken,
        "business",
        truncateFailure(errorMessage(error))
      );
      return;
    }

    const leaseAbortController = new AbortController();
    const removeShutdownForwarder = forwardAbort(
      shutdownSignal,
      leaseAbortController
    );
    let leaseLost = false;
    const heartbeat = startTaskHeartbeat({
      intervalSeconds: lease.heartbeatIntervalSeconds,
      heartbeat: () =>
        this.client.heartbeatTask(lease.task.id, lease.leaseToken),
      onFailure: (error) => {
        leaseLost = true;
        this.log("task.heartbeat.failed", {
          taskId: lease.task.id,
          runId: lease.task.runId,
          error: errorMessage(error)
        });
        leaseAbortController.abort(error);
      }
    });

    this.log("task.started", {
      taskId: lease.task.id,
      runId: lease.task.runId,
      resourceClass: lease.task.resourceClass
    });

    let result: ProviderProcessRunResult;
    try {
      result = await this.adapter.run({
        ...runInput,
        signal: leaseAbortController.signal
      });
    } catch (error) {
      await heartbeat.stop();
      removeShutdownForwarder();
      if (shutdownSignal.aborted || leaseLost) return;
      await this.client.failTask(
        lease.task.id,
        lease.leaseToken,
        "infrastructure",
        truncateFailure(errorMessage(error))
      );
      return;
    }

    await heartbeat.stop();
    removeShutdownForwarder();

    if (shutdownSignal.aborted || leaseLost) {
      this.log("task.cancelled.locally", {
        taskId: lease.task.id,
        runId: lease.task.runId
      });
      return;
    }

    if (result.succeeded) {
      await this.client.completeTask(
        lease.task.id,
        lease.leaseToken,
        serializableResult(result)
      );
      this.log("task.completed", {
        taskId: lease.task.id,
        runId: lease.task.runId
      });
      return;
    }

    await this.client.failTask(
      lease.task.id,
      lease.leaseToken,
      result.timedOut || result.cancelled || result.exitCode === null
        ? "infrastructure"
        : "business",
      truncateFailure(failedRunMessage(result))
    );
    this.log("task.reported.failed", {
      taskId: lease.task.id,
      runId: lease.task.runId,
      exitCode: result.exitCode,
      timedOut: result.timedOut
    });
  }
}

function taskRunInput(task: AgentConnectorTask): ProviderProcessRunInput {
  const instruction = task.payload.instruction;
  if (typeof instruction !== "string" || !instruction.trim()) {
    throw new Error("Agent task payload.instruction must be a non-empty string");
  }

  const args = task.payload.args;
  if (
    args !== undefined &&
    (!Array.isArray(args) || args.some((item) => typeof item !== "string"))
  ) {
    throw new Error("Agent task payload.args must be a string array");
  }

  const cwd = task.payload.cwd;
  if (cwd !== undefined && typeof cwd !== "string") {
    throw new Error("Agent task payload.cwd must be a string");
  }

  return {
    runId: task.runId,
    dayId: task.scope.dayId ?? "unscoped",
    instruction,
    args: args as string[] | undefined,
    cwd
  };
}

function startTaskHeartbeat(options: {
  intervalSeconds: number;
  heartbeat: () => Promise<unknown>;
  onFailure: (error: unknown) => void;
}) {
  const intervalMs = Math.max(1, options.intervalSeconds) * 1_000;
  let stopped = false;
  let timer: NodeJS.Timeout | undefined;
  let inFlight: Promise<void> | undefined;

  const schedule = () => {
    if (stopped) return;
    timer = setTimeout(() => {
      inFlight = options
        .heartbeat()
        .then(() => {
          if (!stopped) schedule();
        })
        .catch((error) => {
          stopped = true;
          options.onFailure(error);
        });
    }, intervalMs);
  };

  schedule();
  return {
    async stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
      await inFlight;
    }
  };
}

function forwardAbort(source: AbortSignal, target: AbortController) {
  const handleAbort = () => target.abort(source.reason);
  source.addEventListener("abort", handleAbort, { once: true });
  if (source.aborted) handleAbort();
  return () => source.removeEventListener("abort", handleAbort);
}

function failedRunMessage(result: ProviderProcessRunResult) {
  const summary = result.timedOut
    ? "Provider process timed out"
    : result.cancelled
      ? "Provider process was cancelled"
      : `Provider process exited with code ${String(result.exitCode)}`;
  return result.output ? `${summary}\n${result.output}` : summary;
}

function serializableResult(result: ProviderProcessRunResult) {
  return {
    runId: result.runId,
    dayId: result.dayId,
    provider: result.provider,
    succeeded: result.succeeded,
    exitCode: result.exitCode,
    signal: result.signal,
    output: result.output,
    outputTruncated: result.outputTruncated,
    timedOut: result.timedOut,
    cancelled: result.cancelled,
    durationMs: result.durationMs
  };
}

function truncateFailure(value: string) {
  return value.slice(0, MAX_FAILURE_MESSAGE_LENGTH);
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function abortableDelay(delayMs: number, signal: AbortSignal) {
  if (signal.aborted || delayMs === 0) return Promise.resolve();
  return new Promise<void>((resolve) => {
    const timer = setTimeout(finish, delayMs);
    const handleAbort = () => finish();
    function finish() {
      clearTimeout(timer);
      signal.removeEventListener("abort", handleAbort);
      resolve();
    }
    signal.addEventListener("abort", handleAbort, { once: true });
  });
}

function nonNegativeInteger(value: number | undefined, fallback: number) {
  return value !== undefined && Number.isInteger(value) && value >= 0
    ? value
    : fallback;
}
