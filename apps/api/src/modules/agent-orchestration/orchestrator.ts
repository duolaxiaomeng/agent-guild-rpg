export type AgentRunStatus =
  | "queued"
  | "running"
  | "paused"
  | "completed"
  | "failed"
  | "cancelled";

export interface AgentRun<TInput = unknown, TResult = unknown> {
  readonly runId: string;
  readonly input?: TInput;
  readonly dependencies: readonly string[];
  readonly status: AgentRunStatus;
  readonly result?: TResult;
  readonly error?: string;
}

export interface AgentLoopControl {
  readonly signal: AbortSignal;
  waitIfPaused(): Promise<void>;
}

export interface AgentLoopRunner<TInput = unknown, TResult = unknown> {
  run(run: AgentRun<TInput, TResult>, control: AgentLoopControl): Promise<TResult>;
}

export interface CreateAgentRunInput<TInput = unknown> {
  readonly runId: string;
  readonly input?: TInput;
  readonly dependencies?: readonly string[];
}

export interface AgentRunEvent {
  readonly previousStatus?: AgentRunStatus;
  readonly run: AgentRun;
}

export interface AgentOrchestratorOptions {
  readonly maxConcurrency?: number;
  readonly onEvent?: (event: AgentRunEvent) => void;
}

export class AgentRunStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AgentRunStateError";
  }
}

type InternalRun = {
  runId: string;
  input?: unknown;
  dependencies: string[];
  status: AgentRunStatus;
  result?: unknown;
  error?: string;
  controller: AbortController;
  paused: boolean;
  workerActive: boolean;
  resumeWaiters: Set<() => void>;
};

const validTransitions: Record<AgentRunStatus, readonly AgentRunStatus[]> = {
  queued: ["running", "paused", "failed", "cancelled"],
  running: ["paused", "completed", "failed", "cancelled"],
  paused: ["queued", "running", "completed", "failed", "cancelled"],
  completed: [],
  failed: [],
  cancelled: []
};

export class AgentOrchestrator {
  private readonly runs = new Map<string, InternalRun>();
  private readonly maxConcurrency: number;
  private readonly onEvent?: (event: AgentRunEvent) => void;
  private activeWorkers = 0;
  private scheduling = false;
  private scheduleAgain = false;

  constructor(
    private readonly runner: AgentLoopRunner,
    options: AgentOrchestratorOptions = {}
  ) {
    const maxConcurrency = options.maxConcurrency ?? 2;
    if (!Number.isInteger(maxConcurrency) || maxConcurrency < 1) {
      throw new RangeError("maxConcurrency must be a positive integer");
    }

    this.maxConcurrency = maxConcurrency;
    this.onEvent = options.onEvent;
  }

  create<TInput = unknown>(input: CreateAgentRunInput<TInput>): AgentRun<TInput> {
    if (!input.runId.trim()) {
      throw new Error("runId is required");
    }
    if (this.runs.has(input.runId)) {
      throw new Error(`run ${input.runId} already exists`);
    }

    const dependencies = [...(input.dependencies ?? [])];
    if (dependencies.includes(input.runId)) {
      throw new Error(`run ${input.runId} cannot depend on itself`);
    }
    if (new Set(dependencies).size !== dependencies.length) {
      throw new Error(`run ${input.runId} has duplicate dependency`);
    }
    for (const dependencyId of dependencies) {
      if (!this.runs.has(dependencyId)) {
        throw new Error(`unknown dependency ${dependencyId}`);
      }
    }

    const record: InternalRun = {
      runId: input.runId,
      input: input.input,
      dependencies,
      status: "queued",
      controller: new AbortController(),
      paused: false,
      workerActive: false,
      resumeWaiters: new Set()
    };
    this.runs.set(record.runId, record);
    this.emit(record);
    return this.snapshot(record) as AgentRun<TInput>;
  }

  restore(runs: readonly AgentRun[]): void {
    for (const run of runs) {
      if (!run.runId.trim() || this.runs.has(run.runId)) {
        continue;
      }

      const recoveredStatus =
        run.status === "running" || run.status === "paused"
          ? "queued"
          : run.status;
      this.runs.set(run.runId, {
        runId: run.runId,
        input: run.input,
        dependencies: [...run.dependencies],
        status: recoveredStatus,
        result: run.result,
        error: run.error,
        controller: new AbortController(),
        paused: false,
        workerActive: false,
        resumeWaiters: new Set()
      });
    }
  }

  schedule(): void {
    if (this.scheduling) {
      this.scheduleAgain = true;
      return;
    }

    this.scheduling = true;
    try {
      let progressed: boolean;
      do {
        this.scheduleAgain = false;
        progressed = false;

        for (const record of this.runs.values()) {
          if (record.status !== "queued") {
            continue;
          }

          const failedDependency = record.dependencies.find((dependencyId) => {
            const dependency = this.runs.get(dependencyId);
            return dependency?.status === "failed" || dependency?.status === "cancelled";
          });
          if (failedDependency) {
            const dependency = this.runs.get(failedDependency);
            const dependencyStatus = dependency?.status ?? "failed";
            this.transition(
              record,
              "failed",
              `dependency ${failedDependency} ${dependencyStatus}`
            );
            progressed = true;
          }
        }

        for (const record of this.runs.values()) {
          if (
            record.status !== "queued" ||
            this.activeWorkers >= this.maxConcurrency ||
            !record.dependencies.every(
              (dependencyId) => this.runs.get(dependencyId)?.status === "completed"
            )
          ) {
            continue;
          }

          this.start(record);
          progressed = true;
        }
      } while (progressed || this.scheduleAgain);
    } finally {
      this.scheduling = false;
    }
  }

  pause(runId: string): AgentRun {
    const record = this.requireRun(runId);
    this.ensureTransition(record, "paused", "pause");
    record.paused = true;
    this.transition(record, "paused");
    return this.snapshot(record);
  }

  resume(runId: string): AgentRun {
    const record = this.requireRun(runId);
    this.ensureTransition(record, "queued", "resume");
    record.paused = false;

    if (record.workerActive) {
      this.transition(record, "running");
      this.releasePauseWaiters(record);
    } else {
      this.transition(record, "queued");
      this.releasePauseWaiters(record);
      this.schedule();
    }

    return this.snapshot(record);
  }

  cancel(runId: string): AgentRun {
    const record = this.requireRun(runId);
    this.ensureTransition(record, "cancelled", "cancel");
    record.paused = false;
    this.transition(record, "cancelled");
    record.controller.abort();
    this.releasePauseWaiters(record);
    this.schedule();
    return this.snapshot(record);
  }

  getRun(runId: string): AgentRun | undefined {
    const record = this.runs.get(runId);
    return record ? this.snapshot(record) : undefined;
  }

  listRuns(): AgentRun[] {
    return [...this.runs.values()].map((record) => this.snapshot(record));
  }

  getActiveWorkerCount(): number {
    return this.activeWorkers;
  }

  private start(record: InternalRun): void {
    record.workerActive = true;
    this.activeWorkers += 1;
    this.transition(record, "running");

    const control: AgentLoopControl = {
      signal: record.controller.signal,
      waitIfPaused: () => {
        if (!record.paused || record.controller.signal.aborted) {
          return Promise.resolve();
        }

        return new Promise<void>((resolve) => {
          record.resumeWaiters.add(resolve);
        });
      }
    };

    let execution: Promise<unknown>;
    try {
      execution = this.runner.run(this.snapshot(record), control);
    } catch (error) {
      execution = Promise.reject(error);
    }

    void execution.then(
      (result) => this.finish(record, result),
      (error) => this.fail(record, error)
    );
  }

  private finish(record: InternalRun, result: unknown): void {
    this.releaseWorker(record);
    if (record.status !== "cancelled") {
      record.result = result;
      this.transition(record, "completed");
    }
    this.schedule();
  }

  private fail(record: InternalRun, error: unknown): void {
    this.releaseWorker(record);
    if (record.status !== "cancelled") {
      this.transition(record, "failed", this.errorMessage(error));
    }
    this.schedule();
  }

  private releaseWorker(record: InternalRun): void {
    if (!record.workerActive) {
      return;
    }

    record.workerActive = false;
    this.activeWorkers -= 1;
  }

  private releasePauseWaiters(record: InternalRun): void {
    const waiters = [...record.resumeWaiters];
    record.resumeWaiters.clear();
    for (const resolve of waiters) {
      resolve();
    }
  }

  private transition(record: InternalRun, status: AgentRunStatus, error?: string): void {
    const previousStatus = record.status;
    if (!validTransitions[previousStatus].includes(status)) {
      throw new AgentRunStateError(
        `cannot transition run ${record.runId} from ${previousStatus} to ${status}`
      );
    }

    record.status = status;
    if (error !== undefined) {
      record.error = error;
    }
    this.emit(record, previousStatus);
  }

  private ensureTransition(
    record: InternalRun,
    status: AgentRunStatus,
    action: string
  ): void {
    if (!validTransitions[record.status].includes(status)) {
      throw new AgentRunStateError(
        `cannot ${action} run ${record.runId} from ${record.status}`
      );
    }
  }

  private requireRun(runId: string): InternalRun {
    const record = this.runs.get(runId);
    if (!record) {
      throw new Error(`unknown run ${runId}`);
    }
    return record;
  }

  private emit(record: InternalRun, previousStatus?: AgentRunStatus): void {
    this.onEvent?.({
      previousStatus,
      run: this.snapshot(record)
    });
  }

  private snapshot(record: InternalRun): AgentRun {
    return {
      runId: record.runId,
      input: record.input,
      dependencies: [...record.dependencies],
      status: record.status,
      ...(record.result !== undefined ? { result: record.result } : {}),
      ...(record.error !== undefined ? { error: record.error } : {})
    };
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
