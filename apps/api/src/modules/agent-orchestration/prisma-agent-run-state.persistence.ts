import { Inject, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import type { AgentRunStatePersistence } from "./agent-orchestration.tokens";
import type { AgentRun, AgentRunEvent, AgentRunStatus } from "./orchestrator";

const RUN_STATUSES = new Set<AgentRunStatus>([
  "queued",
  "running",
  "paused",
  "completed",
  "failed",
  "cancelled"
]);

@Injectable()
export class PrismaAgentRunStatePersistence
  implements AgentRunStatePersistence
{
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async save(event: AgentRunEvent): Promise<void> {
    const data = {
      status: event.run.status,
      input: this.toNullableJson(event.run.input),
      dependencies: [...event.run.dependencies] as Prisma.InputJsonValue,
      result: this.toNullableJson(event.run.result),
      error: event.run.error ?? null,
      previousStatus: event.previousStatus ?? null
    };

    await this.prisma.agentRunSnapshot.upsert({
      where: { runId: event.run.runId },
      create: { runId: event.run.runId, ...data },
      update: data
    });
  }

  async load(): Promise<AgentRun[]> {
    const snapshots = await this.prisma.agentRunSnapshot.findMany({
      orderBy: { createdAt: "asc" }
    });

    return snapshots.flatMap((snapshot) => {
      if (!RUN_STATUSES.has(snapshot.status as AgentRunStatus)) {
        return [];
      }

      const dependencies = Array.isArray(snapshot.dependencies)
        ? snapshot.dependencies.filter(
            (dependency): dependency is string => typeof dependency === "string"
          )
        : [];

      return [{
        runId: snapshot.runId,
        status: snapshot.status as AgentRunStatus,
        dependencies,
        ...(snapshot.input !== null ? { input: snapshot.input } : {}),
        ...(snapshot.result !== null ? { result: snapshot.result } : {}),
        ...(snapshot.error ? { error: snapshot.error } : {})
      }];
    });
  }

  private toNullableJson(value: unknown) {
    return value === undefined
      ? Prisma.DbNull
      : (value as Prisma.InputJsonValue);
  }
}
