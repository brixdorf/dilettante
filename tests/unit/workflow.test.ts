// Checks the GitHub Action that syncs the taxonomy after posts change: it must install with pnpm
// and the Node.js version from package.json, run the sync script, and commit only the taxonomy.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { load } from "js-yaml";
import { describe, expect, it } from "vite-plus/test";

type Step = { uses?: string; run?: string; with?: Record<string, string> };

const root = join(import.meta.dirname, "..", "..");
const workflow = load(readFileSync(join(root, ".github/workflows/sync-taxonomy.yml"), "utf8")) as {
  jobs: { sync: { steps: Step[] } };
};
const steps = workflow.jobs.sync.steps;
const step = (action: string) => steps.find((s) => s.uses?.startsWith(`${action}@`));
const runs = steps.map((s) => s.run).filter(Boolean);

describe("the taxonomy sync Action", () => {
  it("sets up pnpm before Node.js, so Node.js can cache pnpm's downloads", () => {
    const pnpm = steps.indexOf(step("pnpm/action-setup")!);
    const node = steps.indexOf(step("actions/setup-node")!);
    expect(pnpm).toBeGreaterThanOrEqual(0);
    expect(node).toBeGreaterThan(pnpm);
  });

  it("uses the Node.js version from package.json", () => {
    expect(step("actions/setup-node")?.with).toMatchObject({
      "node-version-file": "package.json",
      cache: "pnpm",
    });
  });

  it("installs exactly what the lockfile says, then runs the sync script", () => {
    expect(runs).toEqual(["pnpm install --frozen-lockfile", "node scripts/sync-taxonomy.mjs"]);
  });

  it("commits only the taxonomy file", () => {
    expect(step("stefanzweifel/git-auto-commit-action")?.with?.file_pattern).toBe(
      "src/config/theme.config.ts",
    );
  });
});
