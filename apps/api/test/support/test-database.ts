import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { PrismaClient } from "@prisma/client";
import { seedDatabase } from "../../prisma/seed";

function getDatabaseUrl(databaseName: string) {
  const databaseDir = resolve(process.cwd(), ".tmp", "test-databases");
  const databasePath = resolve(databaseDir, `${databaseName}.db`);

  mkdirSync(databaseDir, { recursive: true });

  if (existsSync(databasePath)) {
    rmSync(databasePath);
  }

  return `file:${databasePath}`;
}

export async function prepareTestDatabase(databaseName: string) {
  const databaseUrl = getDatabaseUrl(databaseName);
  process.env.DATABASE_URL = databaseUrl;
  const prismaExecutable = resolve(
    process.cwd(),
    "node_modules",
    ".bin",
    process.platform === "win32" ? "prisma.cmd" : "prisma"
  );

  // Use Prisma's generated SQL plus db execute instead of db push. The
  // current local runtime returns an empty Schema Engine error from db push.
  const schemaSql = execFileSync(
    prismaExecutable,
    [
      "migrate",
      "diff",
      "--from-empty",
      "--to-schema-datamodel",
      "prisma/schema.prisma",
      "--script"
    ],
    {
      cwd: process.cwd(),
      env: process.env,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"]
    }
  );

  execFileSync(
    prismaExecutable,
    ["db", "execute", "--stdin", "--url", databaseUrl],
    {
      cwd: process.cwd(),
      env: process.env,
      input: schemaSql,
      stdio: "pipe"
    }
  );

  const prisma = new PrismaClient();
  await seedDatabase(prisma);

  return prisma;
}
