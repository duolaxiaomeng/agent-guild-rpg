import { defineConfig } from "@playwright/test";

const E2E_PORT = 3100;
const E2E_BASE_URL = `http://localhost:${E2E_PORT}`;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  timeout: 30_000,
  use: {
    baseURL: E2E_BASE_URL,
    trace: "on-first-retry"
  },
  webServer: {
    command: "pnpm dev:e2e",
    url: E2E_BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000
  }
});
