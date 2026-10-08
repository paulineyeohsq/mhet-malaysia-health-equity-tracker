import { defineConfig } from "vitest/config";

// Unit tests for the pure analysis code in src/lib and consistency checks against public/data.
// Browser smoke tests live in e2e/ and run under Playwright (playwright.config.ts).
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
  },
});
