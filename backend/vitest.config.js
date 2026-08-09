import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    setupFiles: ["./tests/setup.js"],
    testTimeout: 15000, // integration tests hit a real (test) database - default 5s is too tight
    hookTimeout: 20000,
    // Sequential, not parallel: these tests share one test database and
    // create/tear down real rows. Running files in parallel would race
    // on shared data (e.g. two files both trying to register the same
    // seeded admin). Slower, but correct - this is an integration suite,
    // not isolated unit tests.
    fileParallelism: false,
  },
});
