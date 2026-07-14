import type {
  AgentLoopRunner,
  AgentRun,
  AgentRunEvent,
} from "./orchestrator";

export const AGENT_LOOP_RUNNER = Symbol("AGENT_LOOP_RUNNER");
export const AGENT_RUN_STATE_PERSISTENCE = Symbol(
  "AGENT_RUN_STATE_PERSISTENCE",
);
export const AGENT_ORCHESTRATION_OPTIONS = Symbol(
  "AGENT_ORCHESTRATION_OPTIONS",
);

export interface AgentRunStatePersistence {
  save(event: AgentRunEvent): void | Promise<void>;
  load?(): AgentRun[] | Promise<AgentRun[]>;
}

export interface AgentOrchestrationServiceOptions {
  readonly maxConcurrency?: number;
}

/**
 * 安全的默认执行器：没有接入真实 Agent 运行器时明确失败，不伪造执行结果。
 */
export class UnconfiguredAgentLoopRunner implements AgentLoopRunner {
  async run(): Promise<never> {
    throw new Error("Agent loop runner is not configured");
  }
}

/**
 * 默认仍以内存调度器为真相。接入 Prisma 时可替换此 token 对应的 provider。
 */
export class NoopAgentRunStatePersistence
  implements AgentRunStatePersistence
{
  save(): void {
    // Intentionally empty. The in-process orchestrator keeps the current state.
  }
}
