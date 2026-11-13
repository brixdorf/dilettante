// Tests which storage mode Keystatic picks. Locally (pnpm dev) it must save posts as files on disk
// and never talk to GitHub; the built blog on the live site saves through GitHub.
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

const loadConfig = async () => (await import("../../keystatic.config.ts")).default;

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("Keystatic's storage mode", () => {
  it("is local mode in development", async () => {
    vi.stubEnv("PROD", false);
    expect((await loadConfig()).storage).toEqual({ kind: "local" });
  });

  it("is GitHub mode, on brixdorf/dilettante, in the production build", async () => {
    vi.stubEnv("PROD", true);
    expect((await loadConfig()).storage).toEqual({ kind: "github", repo: "brixdorf/dilettante" });
  });
});
