// Guards two rules about installed packages. js-yaml must stay on version 4 with exactly one copy
// installed: keystatic.config.ts changes js-yaml's settings to control how Keystatic writes front
// matter, and that only works when Keystatic uses the very same copy. And pnpm is the package
// manager.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(import.meta.dirname, "..", "..");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const lockfile = readFileSync(join(root, "pnpm-lock.yaml"), "utf8");

describe("js-yaml", () => {
  it("stays on version 4, with its types", () => {
    expect(pkg.dependencies["js-yaml"]).toMatch(/^4\./);
    expect(pkg.dependencies["@types/js-yaml"]).toMatch(/^4\./);
  });

  it("is installed exactly once", () => {
    const versions = new Set(
      [...lockfile.matchAll(/^ {2}js-yaml@([^:(]+)/gm)].map((match) => match[1]),
    );
    expect([...versions]).toEqual([pkg.dependencies["js-yaml"]]);
  });
});

describe("the package manager", () => {
  it("is pnpm, with its lockfile and no npm lockfile", () => {
    expect(pkg.packageManager).toMatch(/^pnpm@\d+\.\d+\.\d+$/);
    expect(existsSync(join(root, "package-lock.json"))).toBe(false);
  });

  it("installs exact versions", () => {
    for (const version of Object.values({ ...pkg.dependencies, ...pkg.devDependencies })) {
      expect(version).toMatch(/^\d+\.\d+\.\d+$/);
    }
  });
});
