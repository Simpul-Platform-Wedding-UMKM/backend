import { defineConfig } from "vitest/config";
import dotenv from "dotenv";

// Force load .env.test variables to override development variables for all test processes
dotenv.config({ path: ".env.test", override: true });

export default defineConfig({
  test: {
    // Run test FILES one at a time — prevents resetDB() in one file from
    // wiping data that another file just wrote. This is the Vitest 4 way
    // (replaces the removed poolOptions.forks.singleFork).
    fileParallelism: false,

    // Global test helpers available in every file without importing
    globals: true,

    setupFiles: ["src/tests/setup.js"],

    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      include: ["src/**/*.js"],
      exclude: ["src/server.js", "src/tests/**"],
    },
  },
});
