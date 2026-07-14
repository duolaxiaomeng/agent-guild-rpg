import { describe, expect, it, vi } from "vitest";
import {
  AgentOrchestrator,
  type AgentLoopRunner,
  type AgentRunEvent
} from "../src/modules/agent-orchestration/orchestrator";

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
};

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });

  return { promise, resolve, reject };
}

async function flush(): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

describe("AgentOrchestrator", () => {
  it("runs at most two workers by default and schedules the next queued run", async () => {
    const gates = new Map<string, Deferred<string>>();
    const started: string[] = [];
    const runner: AgentLoopRunner = {
      run: vi.fn(({ runId }) => {
        started.push(runId);
        const gate = deferred<string>();
        gates.set(runId, gate);
        return gate.promise;
      })
    };
    const orchestrator = new AgentOrchestrator(runner);

    orchestrator.create({ runId: "run-1" });
    orchestrator.create({ runId: "run-2" });
    orchestrator.create({ runId: "run-3" });
    orchestrator.schedule();

    expect(started).toEqual(["run-1", "run-2"]);
    expect(orchestrator.getRun("run-3")?.status).toBe("queued");

    gates.get("run-1")?.resolve("one");
    await flush();

    expect(started).toEqual(["run-1", "run-2", "run-3"]);
    expect(orchestrator.getRun("run-1")).toMatchObject({
      status: "completed",
      result: "one"
    });
  });

  it("waits for dependencies and fails dependent runs when a dependency fails", async () => {
    const parent = deferred<string>();
    const started: string[] = [];
    const runner: AgentLoopRunner = {
      run: vi.fn(({ runId }) => {
        started.push(runId);
        return runId === "parent" ? parent.promise : Promise.resolve("child");
      })
    };
    const orchestrator = new AgentOrchestrator(runner);

    orchestrator.create({ runId: "parent" });
    orchestrator.create({ runId: "child", dependencies: ["parent"] });
    orchestrator.schedule();

    expect(started).toEqual(["parent"]);
    expect(orchestrator.getRun("child")?.status).toBe("queued");

    parent.reject(new Error("agent failed"));
    await flush();

    expect(started).toEqual(["parent"]);
    expect(orchestrator.getRun("parent")).toMatchObject({
      status: "failed",
      error: "agent failed"
    });
    expect(orchestrator.getRun("child")).toMatchObject({
      status: "failed",
      error: "dependency parent failed"
    });
  });

  it("pauses a running worker until resume is requested", async () => {
    const enteredWork = deferred<void>();
    const finishWork = deferred<string>();
    let canWork!: () => void;
    const runner: AgentLoopRunner = {
      run: vi.fn(async (_run, control) => {
        await new Promise<void>((resolve) => {
          canWork = resolve;
        });
        await control.waitIfPaused();
        enteredWork.resolve();
        return finishWork.promise;
      })
    };
    const orchestrator = new AgentOrchestrator(runner);

    orchestrator.create({ runId: "run-1" });
    orchestrator.schedule();
    orchestrator.pause("run-1");
    canWork();
    await flush();

    expect(orchestrator.getRun("run-1")?.status).toBe("paused");
    expect(enteredWork.promise).not.toBe(undefined);

    orchestrator.resume("run-1");
    await enteredWork;
    expect(orchestrator.getRun("run-1")?.status).toBe("running");

    finishWork.resolve("done");
    await flush();
    expect(orchestrator.getRun("run-1")?.status).toBe("completed");
  });

  it("cancels a running worker, aborts its control signal, and does not overwrite cancellation", async () => {
    const aborted = deferred<void>();
    const runner: AgentLoopRunner = {
      run: vi.fn((_run, control) => {
        return new Promise<string>((resolve) => {
          control.signal.addEventListener("abort", () => {
            aborted.resolve();
            resolve("ignored result");
          });
        });
      })
    };
    const orchestrator = new AgentOrchestrator(runner);

    orchestrator.create({ runId: "run-1" });
    orchestrator.schedule();
    const cancelled = orchestrator.cancel("run-1");

    expect(cancelled.status).toBe("cancelled");
    await aborted.promise;
    await flush();
    expect(orchestrator.getRun("run-1")?.status).toBe("cancelled");
  });

  it("emits state-change events and rejects invalid transitions", () => {
    const events: AgentRunEvent[] = [];
    const runner: AgentLoopRunner = {
      run: vi.fn(() => new Promise<string>(() => undefined))
    };
    const orchestrator = new AgentOrchestrator(runner, {
      maxConcurrency: 1,
      onEvent: (event) => events.push(event)
    });

    orchestrator.create({ runId: "run-1" });
    orchestrator.pause("run-1");
    orchestrator.resume("run-1");
    orchestrator.cancel("run-1");

    expect(events.map(({ run }) => run.status)).toEqual([
      "queued",
      "paused",
      "queued",
      "running",
      "cancelled"
    ]);
    expect(() => orchestrator.resume("run-1")).toThrow(/cannot resume/i);
    expect(() => orchestrator.create({ runId: "run-1" })).toThrow(/already exists/i);
  });

  it("rejects unknown and duplicate dependencies", () => {
    const runner: AgentLoopRunner = {
      run: vi.fn(() => Promise.resolve())
    };
    const orchestrator = new AgentOrchestrator(runner);

    expect(() =>
      orchestrator.create({ runId: "child", dependencies: ["missing"] })
    ).toThrow(/unknown dependency/i);

    orchestrator.create({ runId: "parent" });
    expect(() =>
      orchestrator.create({ runId: "child", dependencies: ["parent", "parent"] })
    ).toThrow(/duplicate dependency/i);
  });

  it("restores persisted runs and safely requeues interrupted workers", () => {
    const orchestrator = new AgentOrchestrator({
      run: vi.fn(() => Promise.resolve("done"))
    });

    orchestrator.restore([
      {
        runId: "interrupted",
        status: "running",
        dependencies: [],
        input: { task: "review" }
      },
      {
        runId: "completed",
        status: "completed",
        dependencies: [],
        result: { score: 90 }
      }
    ]);

    expect(orchestrator.getRun("interrupted")).toMatchObject({
      status: "queued",
      input: { task: "review" }
    });
    expect(orchestrator.getRun("completed")).toMatchObject({
      status: "completed",
      result: { score: 90 }
    });
  });
});
