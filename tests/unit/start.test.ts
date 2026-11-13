// Tests how the live server is started. Dokploy builds the blog with Railpack, and Railpack's
// finished image has Node.js but no pnpm, so railpack.json must start the server with node itself,
// the same command "pnpm start" runs here.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(import.meta.dirname, "..", "..");
const read = (name: string) => JSON.parse(readFileSync(join(root, name), "utf8"));

describe("the live start command", () => {
  const start: string = existsSync(join(root, "railpack.json"))
    ? (read("railpack.json").deploy?.startCommand ?? "")
    : "";

  it("runs node directly, never a package manager", () => {
    expect(start).toMatch(/^node /);
    expect(start).not.toMatch(/\b(pnpm|npm|npx|corepack|yarn)\b/);
  });

  it("is the same command as the start script", () => {
    expect(start).toBe(read("package.json").scripts.start);
  });

  it("names the server file the build writes", () => {
    expect(start.split(" ")[1]).toBe("./dist/server/entry.mjs");
  });
});
