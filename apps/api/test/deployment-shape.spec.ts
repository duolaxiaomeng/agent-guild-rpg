import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("classroom deployment shape", () => {
  it("keeps PostgreSQL runtime schema aligned with the SQLite test schema", () => {
    const sqliteSchema = readFileSync(resolve(process.cwd(), "prisma/schema.prisma"), "utf8");
    const postgresSchema = readFileSync(
      resolve(process.cwd(), "prisma/postgresql/schema.prisma"),
      "utf8"
    );

    expect(postgresSchema.replace('provider = "postgresql"', 'provider = "sqlite"'))
      .toBe(sqliteSchema);
  });

  it("provides PostgreSQL, Redis, API and an independent review worker", () => {
    const compose = readFileSync(resolve(process.cwd(), "../../compose.yaml"), "utf8");
    const dockerfile = readFileSync(resolve(process.cwd(), "Dockerfile"), "utf8");
    const migration = readFileSync(
      resolve(
        process.cwd(),
        "prisma/postgresql/migrations/20260714110000_postgresql_baseline/migration.sql"
      ),
      "utf8"
    );

    expect(compose).toContain("postgres:");
    expect(compose).toContain("review-worker:");
    expect(compose).toContain('REVIEW_QUEUE_REQUIRED: "1"');
    expect(compose).toContain("prisma/postgresql/schema.prisma");
    expect(dockerfile).toContain("sync-postgres-schema.cjs --check");
    expect(dockerfile).toContain("prisma/postgresql/schema.prisma");
    expect(migration).toContain('CREATE TYPE "ReviewStatus"');
    expect(migration).toContain('CREATE TABLE "AgentTask"');
  });

  it("requires explicit localhost-only opt-in before capacity writes", () => {
    const guard = readFileSync(
      resolve(process.cwd(), "../../scripts/capacity/guard.mjs"),
      "utf8"
    );
    const forty = readFileSync(
      resolve(process.cwd(), "../../scripts/capacity/forty-submissions.mjs"),
      "utf8"
    );
    const connectors = readFileSync(
      resolve(
        process.cwd(),
        "../../scripts/capacity/one-hundred-twenty-connectors.mjs"
      ),
      "utf8"
    );
    const prepare = readFileSync(
      resolve(process.cwd(), "../../scripts/capacity/prepare-fixtures.mjs"),
      "utf8"
    );

    expect(guard).toContain("I_UNDERSTAND_THIS_IS_A_LOAD_TEST");
    expect(guard).toContain("CAPACITY_TARGET_IS_EPHEMERAL");
    expect(guard).toContain("CAPACITY_ALLOW_WRITES");
    expect(guard).toContain('new Set(["localhost", "127.0.0.1", "::1"])');
    expect(forty).toContain('readFixtureArray("CAPACITY_SUBMISSIONS_FILE", 40)');
    expect(connectors).toContain('readFixtureArray("CAPACITY_CONNECTORS_FILE", 120)');
    expect(connectors).toContain("/agent-connectors/tasks/claim");
    expect(connectors).toContain("/agent-connectors/events/batch");
    expect(prepare).toContain('databaseUrl.startsWith("file:/tmp/")');
    expect(prepare).toContain('parsedDatabaseUrl.pathname === "/classroom"');
    expect(prepare).toContain("studentIndex < 40");
    expect(prepare).toContain("connectorIndex < 3");
  });
});
