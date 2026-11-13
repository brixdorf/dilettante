// Settings for the browser tests in tests/e2e. Playwright builds the blog, starts it with the same
// command as the live server, and opens it in Chromium, Firefox and WebKit. A second server runs
// the blog in development mode, where Keystatic saves posts to files on disk (local mode).
//
// On Fedora, run these inside the Ubuntu toolbox named "playwright" (see the README).
import { defineConfig, devices } from "@playwright/test";

export const SITE_PORT = 4400;
export const DEV_PORT = 4401;

// Made-up values so Keystatic's GitHub mode can start in the built blog. They open nothing.
const KEYSTATIC_TEST_ENV = {
  KEYSTATIC_GITHUB_CLIENT_ID: "test-client-id",
  KEYSTATIC_GITHUB_CLIENT_SECRET: "test-client-secret",
  KEYSTATIC_SECRET: "test-secret-that-is-at-least-32-characters-long",
  PUBLIC_KEYSTATIC_GITHUB_APP_SLUG: "test-app",
};

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
      command: "npm run build && node ./dist/server/entry.mjs",
      url: `http://127.0.0.1:${SITE_PORT}/`,
      env: { ...KEYSTATIC_TEST_ENV, HOST: "127.0.0.1", PORT: String(SITE_PORT) },
      timeout: 300_000,
      reuseExistingServer: false,
      stdout: "ignore",
    },
    {
      command: `npx astro dev --host 127.0.0.1 --port ${DEV_PORT}`,
      url: `http://127.0.0.1:${DEV_PORT}/`,
      timeout: 120_000,
      reuseExistingServer: false,
      stdout: "ignore",
    },
  ],
});
