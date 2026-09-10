import { defineConfig } from "@playwright/test";

const E2E_PORT = 3100;
const E2E_BASE_URL = `http://localhost:${E2E_PORT}`;
const E2E_API_PORT = 3101;
// Keep the API hostname aligned with the browser origin so HttpOnly cookies
// remain available to same-site client requests during production E2E runs.
const E2E_API_URL = `http://localhost:${E2E_API_PORT}`;

export default defineConfig({
  testDir: "./tests/e2e",
  // The classroom flow mutates shared seeded state.  Keep one deterministic
  // worker per isolated API database so future write-oriented specs cannot
  // race one another.
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  use: {
    baseURL: E2E_BASE_URL,
    trace: "on-first-retry",
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
      : undefined
  },
  webServer: [
    {
      command: "bash ../../scripts/start-e2e-api.sh",
      url: `${E2E_API_URL}/health`,
      // Reusing an API would defeat database isolation and leak old classroom
      // sessions into this run.  The script always owns a fresh process/DB.
      reuseExistingServer: false,
      timeout: 240_000
    },
    {
      command: `NEXT_DIST_DIR=.next-e2e NEXT_PUBLIC_API_BASE_URL=${E2E_API_URL} ALLOW_INSECURE_LOCALHOST=1 pnpm e2e:server`,
      url: E2E_BASE_URL,
      reuseExistingServer: false,
      timeout: 240_000
    }
  ]
});
