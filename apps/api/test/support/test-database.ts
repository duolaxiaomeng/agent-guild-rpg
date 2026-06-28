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
  process.env.DATABASE_URL = getDatabaseUrl(databaseName);

  execFileSync("pnpm", ["exec", "prisma", "db", "push", "--skip-generate"], {
    cwd: process.cwd(),
    env: process.env,
    stdio: "pipe"
  });

  const prisma = new PrismaClient();
  await seedDatabase(prisma);

  return prisma;
}
