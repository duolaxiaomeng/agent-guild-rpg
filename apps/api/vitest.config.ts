import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Each test file sets process.env.DATABASE_URL via prepareTestDatabase().
    // Running files in parallel within the same process causes env-var races
    // that manifest as FK-constraint violations in seedDatabase().
    // "forks" isolates every file in its own child process.
    pool: "forks",
    fileParallelism: false,
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
  },
});
