import { createHash } from "node:crypto";
import {
  AgentTaskResourceClass,
  AgentTaskStatus,
  PrismaClient,
} from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AgentConnectorsService } from "../src/modules/agent-connectors/agent-connectors.service";
import { AgentTaskService } from "../src/modules/agent-orchestration/agent-task.service";
import { PrismaService } from "../src/prisma/prisma.service";
import { prepareTestDatabase } from "./support/test-database";

describe("database-backed Agent task control plane", () => {
  let prisma: PrismaClient;
  let tasks: AgentTaskService;
  let connectorSequence = 0;

  beforeAll(async () => {
    prisma = await prepareTestDatabase("agent-task-control-plane");
  });

  beforeEach(async () => {
    await prisma.agentTaskAttempt.deleteMany();
    await prisma.agentTaskDependency.deleteMany();
    await prisma.agentTask.deleteMany();
    await prisma.agentEvent.deleteMany();
    await prisma.agentConnector.deleteMany();
    await prisma.agentSession.deleteMany({
      where: { id: { startsWith: "task-session-" } },
    });
    const connectors = new AgentConnectorsService(
      prisma as unknown as PrismaService,
    );
    tasks = new AgentTaskService(prisma as unknown as PrismaService, connectors);
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it("persists a DAG, renews its lease, completes the session, and unlocks dependents", async () => {
    const connector = await createConnector("student-1", "codex-cli", [
      "terminal.run",
    ]);
    await tasks.create({
      runId: "dag-parent",
      studentId: "student-1",
      provider: "codex-cli",
      input: { instruction: "Build the parent" },
      requiredCapabilities: ["terminal.run"],
    });
    const child = await tasks.create({
      runId: "dag-child",
      studentId: "student-1",
      provider: "codex-cli",
      input: { instruction: "Build the child" },
      dependencies: ["dag-parent"],
    });
    expect(child).toMatchObject({ status: "blocked", blockedByCount: 1 });

    const lease = await tasks.claim(connector.token, claimRequest());
    expect(lease?.task.runId).toBe("dag-parent");
    expect(lease?.heartbeatIntervalSeconds).toBe(15);
    await tasks.heartbeat(
      connector.token,
      lease!.task.id,
      lease!.leaseToken,
    );
    expect(
      await prisma.agentSession.findUnique({
        where: { id: connector.agentSessionId },
      }),
    ).toMatchObject({ status: "active" });

    await tasks.complete(
      connector.token,
      lease!.task.id,
      lease!.leaseToken,
      { output: "done" },
    );
    expect(await tasks.get("dag-child")).toMatchObject({
      status: "queued",
      blockedByCount: 0,
    });
    expect(
      await prisma.agentSession.findUnique({
        where: { id: connector.agentSessionId },
      }),
    ).toMatchObject({ status: "completed" });

    const rebuilt = new AgentTaskService(
      prisma as unknown as PrismaService,
      new AgentConnectorsService(prisma as unknown as PrismaService),
    );
    expect(await rebuilt.get("dag-parent")).toMatchObject({
      status: "completed",
      result: { output: "done" },
    });
  });

  it("enforces student/provider/capabilities and retries infrastructure failures", async () => {
    const capable = await createConnector("student-1", "codex-cli", [
      "terminal.run",
    ]);
    const incapable = await createConnector("student-1", "codex-cli", []);
    const otherStudent = await createConnector("student-2", "codex-cli", [
      "terminal.run",
    ]);
    await tasks.create({
      runId: "retry-task",
      studentId: "student-1",
      provider: "codex-cli",
      input: { instruction: "Retry safely" },
      requiredCapabilities: ["terminal.run"],
      maxAttempts: 2,
    });
    await tasks.create({
      runId: "other-provider",
      studentId: "student-1",
      provider: "claude-code",
      input: { instruction: "Do not claim" },
    });

    expect(await tasks.claim(incapable.token, claimRequest())).toBeNull();
    expect(await tasks.claim(otherStudent.token, claimRequest())).toBeNull();
    const firstLease = await tasks.claim(capable.token, claimRequest());
    expect(firstLease?.task.runId).toBe("retry-task");
    await expect(
      tasks.complete(
        otherStudent.token,
        firstLease!.task.id,
        firstLease!.leaseToken,
        {},
      ),
    ).rejects.toThrow(/lease token/i);

    await tasks.fail(capable.token, firstLease!.task.id, {
      leaseToken: firstLease!.leaseToken,
      kind: "infrastructure",
      error: "provider process unavailable",
    });
    expect(await tasks.get("retry-task")).toMatchObject({
      status: "queued",
      attemptCount: 1,
    });
    await prisma.agentTask.updateMany({
      where: { runId: "retry-task" },
      data: { availableAt: new Date(0) },
    });

    const secondLease = await tasks.claim(capable.token, claimRequest());
    await tasks.fail(capable.token, secondLease!.task.id, {
      leaseToken: secondLease!.leaseToken,
      kind: "infrastructure",
      error: "provider process unavailable again",
    });
    expect(await tasks.get("retry-task")).toMatchObject({
      status: "needs_teacher",
      attemptCount: 2,
    });
    expect(await tasks.get("other-provider")).toMatchObject({ status: "queued" });
    expect(
      await prisma.agentSession.findUnique({
        where: { id: capable.agentSessionId },
      }),
    ).toMatchObject({ status: "failed" });
  });

  it("leases at most one heavy task per student under concurrent claims", async () => {
    const first = await createConnector("student-1", "codex-cli", []);
    const second = await createConnector("student-1", "codex-cli", []);
    for (const runId of ["heavy-a", "heavy-b"]) {
      await tasks.create({
        runId,
        studentId: "student-1",
        provider: "codex-cli",
        input: { instruction: runId },
        resourceClass: AgentTaskResourceClass.heavy,
      });
    }

    await Promise.allSettled([
      tasks.claim(first.token, claimRequest()),
      tasks.claim(second.token, claimRequest()),
    ]);
    const activeHeavy = await prisma.agentTask.count({
      where: {
        studentId: "student-1",
        resourceClass: AgentTaskResourceClass.heavy,
        status: { in: [AgentTaskStatus.leased, AgentTaskStatus.running] },
      },
    });
    expect(activeHeavy).toBe(1);
  });

  async function createConnector(
    studentId: string,
    provider: string,
    capabilities: string[],
  ) {
    connectorSequence += 1;
    const token = `connector-test-${connectorSequence}`;
    const agentSession = await prisma.agentSession.create({
      data: {
        id: `task-session-${connectorSequence}`,
        studentId,
        provider,
        status: "active",
      },
    });
    await prisma.agentConnector.create({
      data: {
        id: `task-connector-${connectorSequence}`,
        studentId,
        agentSessionId: agentSession.id,
        provider,
        clientName: `test-client-${connectorSequence}`,
        tokenHash: createHash("sha256").update(token).digest("hex"),
        status: "online",
        capabilities,
      },
    });
    return { token, agentSessionId: agentSession.id };
  }
});

function claimRequest() {
  return { lightCapacity: 1, heavyCapacity: 1, waitSeconds: 0 };
}
