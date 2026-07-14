#!/usr/bin/env bash
set -euo pipefail

# Playwright owns this process for the duration of an E2E run.  Always create
# the database in a fresh temporary directory so a test run cannot mutate a
# developer's apps/api/prisma/dev.db (or a database configured for dev).
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
E2E_DB_DIR="$(mktemp -d "${TMPDIR:-/tmp}/agent-guild-e2e.XXXXXX")"
E2E_DB_PATH="$E2E_DB_DIR/e2e.db"
API_PORT="${PORT:-3101}"
API_PID=""

cleanup() {
  local status=$?
  trap - EXIT INT TERM
  if [[ -n "$API_PID" ]] && kill -0 "$API_PID" 2>/dev/null; then
    kill "$API_PID" 2>/dev/null || true
    wait "$API_PID" 2>/dev/null || true
  fi
  rm -rf "$E2E_DB_DIR"
  exit "$status"
}
trap cleanup EXIT INT TERM

# Reuse the canonical seed path, but point it at the temporary DB.  The reset
# script is intentionally never called without DATABASE_PATH here.
DATABASE_PATH="$E2E_DB_PATH" "$ROOT_DIR/scripts/reset-dev-db.sh" >/dev/null

cd "$ROOT_DIR"
DATABASE_URL="file:$E2E_DB_PATH" \
  PORT="$API_PORT" \
  ALLOWED_ORIGINS="http://localhost:3100,http://127.0.0.1:3100" \
  REDIS_URL="" \
  NODE_ENV="test" \
  node apps/api/dist/src/main.js &
API_PID=$!

for _ in {1..120}; do
  if curl --silent --fail "http://127.0.0.1:${API_PORT}/health" >/dev/null 2>&1; then
    wait "$API_PID"
    exit $?
  fi
  if ! kill -0 "$API_PID" 2>/dev/null; then
    wait "$API_PID"
    exit $?
  fi
  sleep 0.25
done

echo "E2E API did not become ready on port ${API_PORT}" >&2
exit 1
