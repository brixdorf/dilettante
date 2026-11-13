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

describe("Keystatic's post fields match the blog's content rules", () => {
  it("offers only the configured authors", async () => {
    const { authors } = await import("../../src/config/authors.ts");
    const author = (await loadConfig()).collections!.blog.schema.author as unknown as {
      kind: string;
      options: { value: string }[];
    };
    expect(author.options.map((option) => option.value)).toEqual(authors.map((item) => item.slug));
  });

  it("requires alt text for the thumbnail", async () => {
    const alt = (await loadConfig()).collections!.blog.schema.thumbnailAlt as unknown as {
      validate: (value: string) => unknown;
    };
    expect(() => alt.validate("")).toThrow();
    expect(alt.validate("A waving hand.")).toBe("A waving hand.");
  });
});
