import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  type OnApplicationShutdown,
  type OnModuleInit,
} from "@nestjs/common";
import {
  AgentOrchestrator,
  AgentRunStateError,
  type AgentLoopRunner,
  type AgentRun,
  type AgentRunEvent,
  type CreateAgentRunInput,
} from "./orchestrator";
import {
  AGENT_LOOP_RUNNER,
  AGENT_ORCHESTRATION_OPTIONS,
  AGENT_RUN_STATE_PERSISTENCE,
  type AgentOrchestrationServiceOptions,
  type AgentRunStatePersistence,
} from "./agent-orchestration.tokens";

@Injectable()
export class AgentOrchestrationService
  implements OnModuleInit, OnApplicationShutdown
{
  private readonly logger = new Logger(AgentOrchestrationService.name);
  private readonly orchestrator: AgentOrchestrator;
  private persistenceChain = Promise.resolve();

  constructor(
    @Inject(AGENT_LOOP_RUNNER) runner: AgentLoopRunner,
    @Inject(AGENT_RUN_STATE_PERSISTENCE)
    private readonly persistence: AgentRunStatePersistence,
    @Inject(AGENT_ORCHESTRATION_OPTIONS)
    options: AgentOrchestrationServiceOptions,
  ) {
    this.orchestrator = new AgentOrchestrator(runner, {
      maxConcurrency: options.maxConcurrency,
      onEvent: (event) => this.persistSnapshot(event),
    });
  }

  async onModuleInit(): Promise<void> {
    const snapshots = await this.persistence.load?.();
    if (snapshots) {
      this.orchestrator.restore(snapshots);
      for (const snapshot of snapshots) {
        if (snapshot.status !== "running" && snapshot.status !== "paused") {
          continue;
        }
        const recovered = this.orchestrator.getRun(snapshot.runId);
        if (recovered) {
          await this.persistence.save({
            previousStatus: snapshot.status,
            run: recovered
          });
        }
      }
    }
  }

  async onApplicationShutdown(): Promise<void> {
    await this.persistenceChain;
  }

  create<TInput = unknown>(input: CreateAgentRunInput<TInput>): AgentRun<TInput> {
    try {
      return this.orchestrator.create(input);
    } catch (error) {
      const message = this.errorMessage(error);
      if (/already exists/i.test(message)) {
        throw new ConflictException(message);
      }
      throw new BadRequestException(message);
    }
  }

  list(): AgentRun[] {
    return this.orchestrator.listRuns();
  }

  get(runId: string): AgentRun {
    const run = this.orchestrator.getRun(runId);
    if (!run) {
      throw new NotFoundException(`Agent run not found: ${runId}`);
    }
    return run;
  }

  schedule(): { runs: AgentRun[] } {
    this.orchestrator.schedule();
    return { runs: this.orchestrator.listRuns() };
  }

  pause(runId: string): AgentRun {
    return this.mutate(runId, () => this.orchestrator.pause(runId));
  }

  resume(runId: string): AgentRun {
    return this.mutate(runId, () => this.orchestrator.resume(runId));
  }

  cancel(runId: string): AgentRun {
    return this.mutate(runId, () => this.orchestrator.cancel(runId));
  }

  private mutate(runId: string, action: () => AgentRun): AgentRun {
    if (!this.orchestrator.getRun(runId)) {
      throw new NotFoundException(`Agent run not found: ${runId}`);
    }

    try {
      return action();
    } catch (error) {
      if (error instanceof AgentRunStateError) {
        throw new ConflictException(error.message);
      }
      throw error;
    }
  }

  private persistSnapshot(event: AgentRunEvent): void {
    this.persistenceChain = this.persistenceChain
      .then(() => this.persistence.save(event))
      .then(() => undefined)
      .catch((error: unknown) => {
        this.logger.error(
          `Failed to persist Agent run ${event.run.runId}: ${this.errorMessage(error)}`,
        );
      });
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
