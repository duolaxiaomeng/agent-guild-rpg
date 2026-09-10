import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  AgentConnectorTask,
  AgentTaskLease
} from "./client.js";
import type { ProviderProcessRunResult } from "./adapters/provider-process-adapter.js";
import { AgentTaskWorker } from "./task-worker.js";

function task(overrides: Partial<AgentConnectorTask> = {}): AgentConnectorTask {
  return {
    id: "task-1",
    runId: "run-1",
    scope: {
      courseWorldId: "world-1",
      dayId: "day-1",
      guildId: null,
      studentId: "student-1"
    },
    provider: "codex-cli",
    requiredCapabilities: ["provider-process"],
    priority: 10,
    resourceClass: "heavy",
    status: "leased",
    payload: { instruction: "Inspect the project", args: ["--full-auto"] },
    attemptCount: 1,
    maxAttempts: 3,
    createdAt: "2026-07-14T00:00:00.000Z",
    ...overrides
  };
}

function lease(taskOverrides: Partial<AgentConnectorTask> = {}): AgentTaskLease {
  return {
    task: task(taskOverrides),
    leaseToken: "lease-token-with-at-least-thirty-two-characters",
    leaseExpiresAt: "2026-07-14T00:01:00.000Z",
    heartbeatIntervalSeconds: 15
  };
}

function result(overrides: Partial<ProviderProcessRunResult> = {}) {
  return {
    runId: "run-1",
    dayId: "day-1",
    provider: "codex-cli",
    succeeded: true,
    exitCode: 0,
    signal: null,
    output: "done",
    outputTruncated: false,
    timedOut: false,
    cancelled: false,
    durationMs: 100,
    ...overrides
  } satisfies ProviderProcessRunResult;
}

function workerHarness(taskLease: AgentTaskLease, runResult: ProviderProcessRunResult) {
  const shutdown = new AbortController();
  const claimTask = vi
    .fn()
    .mockResolvedValueOnce(taskLease)
    .mockImplementation(async () => {
      shutdown.abort();
      return null;
    });
  const client = {
    claimTask,
    heartbeatTask: vi.fn().mockResolvedValue({}),
    completeTask: vi.fn().mockResolvedValue({}),
    failTask: vi.fn().mockResolvedValue({})
  };
  const adapter = { run: vi.fn().mockResolvedValue(runResult) };
  const worker = new AgentTaskWorker({ client, adapter, idleDelayMs: 0 });
  return { shutdown, client, adapter, worker };
}

describe("AgentTaskWorker", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("claims one task, reuses the adapter and reports its structured result", async () => {
    const harness = workerHarness(lease(), result());

    await harness.worker.run(harness.shutdown.signal);

    expect(harness.client.claimTask).toHaveBeenCalledWith(
      { lightCapacity: 1, heavyCapacity: 1, waitSeconds: 25 },
      harness.shutdown.signal
    );
    expect(harness.adapter.run).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: "run-1",
        dayId: "day-1",
        instruction: "Inspect the project",
        args: ["--full-auto"],
        signal: expect.any(AbortSignal)
      })
    );
    expect(harness.client.completeTask).toHaveBeenCalledWith(
      "task-1",
      "lease-token-with-at-least-thirty-two-characters",
      expect.objectContaining({ output: "done", succeeded: true })
    );
    expect(harness.client.failTask).not.toHaveBeenCalled();
  });

  it("rejects an invalid task payload as a business failure", async () => {
    const harness = workerHarness(
      lease({ payload: { args: ["--full-auto"] } }),
      result()
    );

    await harness.worker.run(harness.shutdown.signal);

    expect(harness.adapter.run).not.toHaveBeenCalled();
    expect(harness.client.failTask).toHaveBeenCalledWith(
      "task-1",
      "lease-token-with-at-least-thirty-two-characters",
      "business",
      expect.stringMatching(/payload\.instruction/)
    );
  });

  it("reports provider timeout as an infrastructure failure", async () => {
    const harness = workerHarness(
      lease(),
      result({
        succeeded: false,
        exitCode: null,
        timedOut: true,
        output: "provider timed out"
      })
    );

    await harness.worker.run(harness.shutdown.signal);

    expect(harness.client.failTask).toHaveBeenCalledWith(
      "task-1",
      "lease-token-with-at-least-thirty-two-characters",
      "infrastructure",
      expect.stringContaining("timed out")
    );
    expect(harness.client.completeTask).not.toHaveBeenCalled();
  });

  it("renews a running task after the server-provided 15 second interval", async () => {
    vi.useFakeTimers();
    const shutdown = new AbortController();
    let finishRun: ((value: ProviderProcessRunResult) => void) | undefined;
    const adapter = {
      run: vi.fn(
        () =>
          new Promise<ProviderProcessRunResult>((resolve) => {
            finishRun = resolve;
          })
      )
    };
    const client = {
      claimTask: vi
        .fn()
        .mockResolvedValueOnce(lease())
        .mockImplementation(async () => {
          shutdown.abort();
          return null;
        }),
      heartbeatTask: vi.fn().mockResolvedValue({}),
      completeTask: vi.fn().mockResolvedValue({}),
      failTask: vi.fn().mockResolvedValue({})
    };
    const worker = new AgentTaskWorker({ client, adapter, idleDelayMs: 0 });

    const running = worker.run(shutdown.signal);
    await vi.advanceTimersByTimeAsync(15_000);
    expect(client.heartbeatTask).toHaveBeenCalledWith(
      "task-1",
      "lease-token-with-at-least-thirty-two-characters"
    );

    finishRun?.(result());
    await vi.runAllTimersAsync();
    await running;
  });

  it("stops the local provider on manual shutdown without committing a result", async () => {
    const shutdown = new AbortController();
    const client = {
      claimTask: vi.fn().mockResolvedValue(lease()),
      heartbeatTask: vi.fn().mockResolvedValue({}),
      completeTask: vi.fn().mockResolvedValue({}),
      failTask: vi.fn().mockResolvedValue({})
    };
    const adapter = {
      run: vi.fn(
        (input: { signal?: AbortSignal }) =>
          new Promise<ProviderProcessRunResult>((resolve) => {
            input.signal?.addEventListener(
              "abort",
              () => resolve(result({ succeeded: false, cancelled: true })),
              { once: true }
            );
          })
      )
    };
    const worker = new AgentTaskWorker({ client, adapter, idleDelayMs: 0 });

    const running = worker.run(shutdown.signal);
    await vi.waitFor(() => expect(adapter.run).toHaveBeenCalled());
    shutdown.abort();
    await running;

    expect(client.completeTask).not.toHaveBeenCalled();
    expect(client.failTask).not.toHaveBeenCalled();
  });
});
