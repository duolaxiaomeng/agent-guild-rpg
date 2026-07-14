import { defineConfig } from "vitest/config";

export default defineConfig({
  esbuild: {
    jsx: "automatic"
  },
  test: {
    exclude: ["tests/e2e/**", "node_modules/**", "dist/**", ".next/**", "playwright.config.test.ts"],
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"]
  }
});
