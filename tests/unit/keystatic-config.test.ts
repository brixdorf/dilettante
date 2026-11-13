// Tests which storage mode Keystatic picks. Locally (pnpm dev) it must save posts as files on disk
// and never talk to GitHub; the built blog on the live site saves through GitHub.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
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

  it("explains the author and category in plain words, without file names", async () => {
    const { schema } = (await loadConfig()).collections!.blog;
    // Keystatic hands a field's help text only to the input it draws in the admin.
    const help = (field: unknown) =>
      (field as { Input: (props: object) => { props: { description?: string } } }).Input({}).props
        .description;
    expect(help(schema.author)).toBe("Who wrote this post.");
    expect(help(schema.category)).toBe("The section this post belongs to, e.g. “tech” or “life”.");
  });

  it("requires alt text for the thumbnail", async () => {
    const alt = (await loadConfig()).collections!.blog.schema.thumbnailAlt as unknown as {
      validate: (value: string) => unknown;
    };
    expect(() => alt.validate("")).toThrow();
    expect(alt.validate("A waving hand.")).toBe("A waving hand.");
  });
});

describe("Keystatic's Blog posts list", () => {
  // Keystatic opens the list sorted by slug, smallest first, comparing what parseSlugForSort gives.
  const sortedByKeystatic = async (slugs: string[]) => {
    const { parseSlugForSort } = (await loadConfig()).collections!.blog;
    const keyOf = (slug: string) => parseSlugForSort!(slug);
    return [...slugs].sort((a, b) => (keyOf(a) < keyOf(b) ? -1 : keyOf(a) > keyOf(b) ? 1 : 0));
  };

  const blogDir = join(import.meta.dirname, "..", "..", "src", "content", "blog");
  const posts = readdirSync(blogDir).map((slug) => ({
    slug,
    date: /^date: (\S+)$/m.exec(readFileSync(join(blogDir, slug, "index.mdx"), "utf8"))![1],
  }));

  it("opens with the oldest post first and the newest last", async () => {
    const byDate = [...posts].sort((a, b) => a.date.localeCompare(b.date)).map((post) => post.slug);
    expect(await sortedByKeystatic(posts.map((post) => post.slug))).toEqual(byDate);
  });

  it("puts a post it has no date for, such as one just made on the live site, last", async () => {
    const slugs = ["a-brand-new-post", ...posts.map((post) => post.slug)];
    expect((await sortedByKeystatic(slugs)).at(-1)).toBe("a-brand-new-post");
  });
});
