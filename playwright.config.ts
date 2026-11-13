// Settings for the browser tests in tests/e2e. Playwright builds the blog, starts it with the same
// command as the live server, and opens it in Chromium, Firefox and WebKit. A second server runs
// the blog in development mode, where Keystatic saves posts to files on disk (local mode).
//
// On Fedora, run these inside the Ubuntu toolbox named "playwright" (see the README).
import { defineConfig, devices } from "@playwright/test";

export const SITE_PORT = 4400;
export const DEV_PORT = 4401;

const site = { baseURL: `http://127.0.0.1:${SITE_PORT}` };

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  reporter: [["list"]],
  outputDir: "test-results",
  use: { trace: "retain-on-failure" },
  projects: [
    {
      name: "chromium",
      testIgnore: /keystatic-editor/,
      use: { ...devices["Desktop Chrome"], ...site },
    },
    {
      name: "firefox",
      testIgnore: /keystatic-editor/,
      use: { ...devices["Desktop Firefox"], ...site },
    },
    {
      name: "webkit",
      testIgnore: /keystatic-editor/,
      use: { ...devices["Desktop Safari"], ...site },
    },
    {
      // Keystatic writes files, so these run one at a time, in one browser, on the dev server.
      name: "keystatic",
      testMatch: /keystatic-editor/,
      fullyParallel: false,
      use: { ...devices["Desktop Chrome"], baseURL: `http://127.0.0.1:${DEV_PORT}` },
    },
  ],
  webServer: [
    {
      // Keystatic's settings reach the running server only, as on the live site.
      command:
        "pnpm run build && node --env-file=tests/e2e/keystatic-test.env ./dist/server/entry.mjs",
      url: `http://127.0.0.1:${SITE_PORT}/`,
      env: { HOST: "127.0.0.1", PORT: String(SITE_PORT) },
      timeout: 300_000,
      reuseExistingServer: false,
      stdout: "ignore",
    },
    {
      command: `pnpm exec astro dev --host 127.0.0.1 --port ${DEV_PORT}`,
      url: `http://127.0.0.1:${DEV_PORT}/`,
      timeout: 120_000,
      reuseExistingServer: false,
      stdout: "ignore",
    },
  ],
});
