import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { writeFile } from "node:fs/promises";

if (process.env.CAPACITY_TEST_OPT_IN !== "I_UNDERSTAND_THIS_IS_A_LOAD_TEST") {
  throw new Error("Set CAPACITY_TEST_OPT_IN before preparing capacity fixtures");
}
if (process.env.CAPACITY_TARGET_IS_EPHEMERAL !== "1") {
  throw new Error("Capacity fixtures may only target an explicitly ephemeral database");
}
const databaseUrl = process.env.DATABASE_URL ?? "";
const isTemporarySqlite = databaseUrl.startsWith("file:/tmp/");
let isLocalPostgres = false;
try {
  const parsedDatabaseUrl = new URL(databaseUrl);
  isLocalPostgres =
    ["postgres:", "postgresql:"].includes(parsedDatabaseUrl.protocol) &&
    ["localhost", "127.0.0.1", "::1"].includes(parsedDatabaseUrl.hostname) &&
    parsedDatabaseUrl.pathname === "/classroom";
} catch {
  isLocalPostgres = false;
}
if (!isTemporarySqlite && !isLocalPostgres) {
  throw new Error(
    "Fixture preparation is restricted to /tmp SQLite or localhost PostgreSQL classroom databases"
  );
}

const require = createRequire(
  new URL("../../apps/api/package.json", import.meta.url)
);
const {
  AgentConnectorStatus,
  AgentSessionStatus,
  PrismaClient,
  UserRole,
} = require("@prisma/client");
const prisma = new PrismaClient();
const submissions = [];
const connectors = [];
const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1_000);

try {
  for (let studentIndex = 0; studentIndex < 40; studentIndex += 1) {
    const suffix = String(studentIndex + 1).padStart(2, "0");
    const studentId = `capacity-student-${suffix}`;
    const loginToken = `capacity-login-token-${suffix}`;
    const loginTokenHash = createHash("sha256").update(loginToken).digest("hex");
    await prisma.user.upsert({
      where: { id: studentId },
      create: {
        id: studentId,
        role: UserRole.student,
        email: `capacity-${suffix}@ephemeral.test`,
        passwordHash: "capacity-fixture-not-for-login",
        displayName: `Capacity Student ${suffix}`,
        isOnline: false,
      },
      update: {},
    });
    await prisma.userSession.upsert({
      where: { id: `capacity-user-session-${suffix}` },
      create: {
        id: `capacity-user-session-${suffix}`,
        userId: studentId,
        token: loginTokenHash,
        expiresAt,
      },
      update: { userId: studentId, token: loginTokenHash, expiresAt },
    });

    for (let connectorIndex = 0; connectorIndex < 3; connectorIndex += 1) {
      const agentSessionId = `capacity-agent-session-${suffix}-${connectorIndex}`;
      const connectorToken = `capacity-connector-token-${suffix}-${connectorIndex}`;
      const connectorId = `capacity-connector-${suffix}-${connectorIndex}`;
      await prisma.agentSession.upsert({
        where: { id: agentSessionId },
        create: {
          id: agentSessionId,
          studentId,
          provider: "codex",
          status: AgentSessionStatus.active,
        },
        update: { status: AgentSessionStatus.active },
      });
      await prisma.agentConnector.upsert({
        where: { agentSessionId },
        create: {
          id: connectorId,
          studentId,
          agentSessionId,
          provider: "codex",
          clientName: `capacity-${suffix}-${connectorIndex}`,
          tokenHash: createHash("sha256").update(connectorToken).digest("hex"),
          status: AgentConnectorStatus.online,
          capabilities: ["task.execute"],
          lastSeenAt: new Date(),
        },
        update: {
          status: AgentConnectorStatus.online,
          lastSeenAt: new Date(),
        },
      });
      connectors.push({ connectorToken });
    }

    submissions.push({
      token: loginToken,
      body: {
        clientRequestId: `capacity-submission-${suffix}`,
        studentId,
        courseWorldId: "course-world-1",
        dayId: "day-1",
        agentSessionId: `capacity-agent-session-${suffix}-0`,
        triggerType: "button",
        conversationSummary: `Capacity student ${suffix} verified the assignment with a local Agent.`,
        workSummary: `Capacity student ${suffix} completed the classroom concurrency fixture.`,
        artifacts: [
          {
            kind: "repo",
            label: `capacity-artifact-${suffix}`,
            url: `/capacity/student-${suffix}`,
          },
        ],
        selfReflection: "The workflow remained responsive during the concurrent classroom submission test.",
        agentEvaluationHints: ["capacity-test"],
        timestamp: new Date().toISOString(),
      },
    });
  }

  const submissionPath = "/tmp/game-system-two-capacity-submissions.json";
  const connectorPath = "/tmp/game-system-two-capacity-connectors.json";
  await Promise.all([
    writeFile(submissionPath, `${JSON.stringify(submissions)}\n`, { mode: 0o600 }),
    writeFile(connectorPath, `${JSON.stringify(connectors)}\n`, { mode: 0o600 }),
  ]);
  console.log(
    JSON.stringify({
      students: submissions.length,
      connectors: connectors.length,
      submissionPath,
      connectorPath,
    })
  );
} finally {
  await prisma.$disconnect();
}
