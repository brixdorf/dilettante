// Settings for Vite+, which formats (Oxfmt), lints (Oxlint) and runs the unit tests (Vitest).
// "pnpm run lint" runs "vp check", "pnpm test" runs "vp test". Astro does not read this file: the
// blog's own build settings are in astro.config.mjs. The browser tests in tests/e2e run with
// Playwright (playwright.config.ts).
import { defineConfig } from "vite-plus";
import postDates from "./scripts/post-dates.mjs";

export default defineConfig({
  // keystatic.config.ts, which the unit tests load, imports the post dates this makes.
  plugins: [postDates()],
  lint: {
    jsPlugins: [{ name: "vite-plus", specifier: "vite-plus/oxlint-plugin" }],
    rules: { "vite-plus/prefer-vite-plus-imports": "error" },
    options: { typeAware: true, typeCheck: true },
  },
  fmt: {
    printWidth: 100,
    semi: true,
    singleQuote: false,
    trailingComma: "all",
    sortPackageJson: false,
    // The posts are written and saved by Keystatic in its own format, so they are never reformatted.
    ignorePatterns: [
      "node_modules",
      "dist",
      ".astro",
      "pnpm-lock.yaml",
      "test-results",
      "src/content/**",
      // Made by "pnpm run pictures", and never edited by hand.
      "picture-cache",
      "AGENTS.md",
      "CHANGELOG.md",
    ],
  },
  test: {
    include: ["tests/unit/**/*.test.ts"],
  },
});
