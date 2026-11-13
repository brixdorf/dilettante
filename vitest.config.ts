// Settings for Vitest, the unit test runner. The browser tests in tests/e2e run with Playwright.
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/unit/**/*.test.ts"],
  },
});
