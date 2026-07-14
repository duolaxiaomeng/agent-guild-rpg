#!/usr/bin/env bash
set -euo pipefail

if [[ "${NODE_ENV:-development}" == "production" ]]; then
  echo "Refusing to reset a database while NODE_ENV=production" >&2
  exit 1
fi

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DATABASE_PATH="${DATABASE_PATH:-$ROOT_DIR/apps/api/prisma/dev.db}"
export DATABASE_URL="file:${DATABASE_PATH}"

mkdir -p "$(dirname "$DATABASE_PATH")"
rm -f "$DATABASE_PATH"

SCHEMA_SQL="$(pnpm --filter api exec prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script)"
printf '%s' "$SCHEMA_SQL" | pnpm --filter api exec prisma db execute --stdin --url "$DATABASE_URL"
pnpm --filter api build >/dev/null

(cd "$ROOT_DIR/apps/api" && \
  SEED_MODULE="$ROOT_DIR/apps/api/dist/prisma/seed.js" \
    node -e 'const { PrismaClient } = require("@prisma/client"); const { seedDatabase } = require(process.env.SEED_MODULE); (async () => { const prisma = new PrismaClient(); try { await seedDatabase(prisma); } finally { await prisma.$disconnect(); } })().catch((error) => { console.error(error); process.exit(1); });')

echo "Seeded database at $DATABASE_PATH"
