const { mkdirSync, readFileSync, writeFileSync } = require("node:fs");
const { dirname, resolve } = require("node:path");

const apiRoot = resolve(__dirname, "..");
const sourcePath = resolve(apiRoot, "prisma/schema.prisma");
const destinationPath = resolve(apiRoot, "prisma/postgresql/schema.prisma");
const source = readFileSync(sourcePath, "utf8");
const providerLine = '  provider = "sqlite"';
const occurrences = source.split(providerLine).length - 1;
if (occurrences !== 1) {
  throw new Error(`Expected exactly one SQLite datasource provider, found ${occurrences}`);
}

const expected = source.replace(providerLine, '  provider = "postgresql"');
if (process.argv.includes("--check")) {
  let current = "";
  try {
    current = readFileSync(destinationPath, "utf8");
  } catch {
    // The error below explains how to repair a missing generated mirror.
  }
  if (current !== expected) {
    throw new Error("PostgreSQL schema mirror is stale; run node apps/api/scripts/sync-postgres-schema.cjs");
  }
  process.exit(0);
}

mkdirSync(dirname(destinationPath), { recursive: true });
writeFileSync(destinationPath, expected);
