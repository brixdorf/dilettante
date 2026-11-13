// Tests the taxonomy sync: the script that keeps the category and tag lists in the theme config
// in step with the categories and tags the posts actually use. The GitHub Action and the dev
// server both run it.
import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";
import { describeSync, displayNameFor, syncTaxonomy } from "../../scripts/sync-taxonomy.mjs";

const repoRoot = join(import.meta.dirname, "..", "..");
const CONFIG = "src/config/theme.config.ts";

const post = (category: string, tags: string[]) =>
  [
    "---",
    `title: "A post"`,
    `category: ${JSON.stringify(category)}`,
    `tags: [${tags.map((tag) => JSON.stringify(tag)).join(", ")}]`,
    "---",
    "",
    "Body.",
    "",
  ].join("\n");

let root: string;
const quiet = { warn: () => {}, info: () => {} } as unknown as Console;

const writePost = (slug: string, category: string, tags: string[]) => {
  mkdirSync(join(root, "src/content/blog", slug), { recursive: true });
  writeFileSync(join(root, "src/content/blog", slug, "index.mdx"), post(category, tags));
};

const readConfig = () => readFileSync(join(root, CONFIG), "utf8");

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "dilettante-taxonomy-"));
  mkdirSync(join(root, "src/config"), { recursive: true });
  cpSync(join(repoRoot, CONFIG), join(root, CONFIG));
});

afterEach(() => rmSync(root, { recursive: true, force: true }));

describe("the taxonomy sync", () => {
  it("leaves the real repository unchanged, because it is already in sync", () => {
    const result = syncTaxonomy({ root: repoRoot, logger: quiet, dryRun: true })!;
    expect(result).not.toBeNull();
    expect(result.changed).toBe(false);
  });

  it("adds new categories and tags and removes unused ones", () => {
    writePost("one", "tech", ["writing", "brand-new-tag"]);
    writePost("two", "fresh-category", ["writing"]);

    const result = syncTaxonomy({ root, logger: quiet })!;

    expect(result.changed).toBe(true);
    expect(result.added).toEqual({ categories: ["fresh-category"], tags: ["brand-new-tag"] });
    expect(result.removed.categories).toEqual(["life"]);
    expect(result.removed.tags).toContain("security");
    expect(result.removed.tags).not.toContain("writing");

    const config = readConfig();
    expect(config).toContain('{ slug: "fresh-category", name: "Fresh Category" }');
    expect(config).toContain('{ slug: "brand-new-tag", name: "Brand New Tag" }');
    expect(config).toContain('{ slug: "tech", name: "Tech" }');
    expect(config).not.toContain('slug: "life"');
    expect(describeSync(result)).toContain("+fresh-category");
    expect(describeSync(result)).toContain("+#brand-new-tag");
  });

  it("keeps names Romit set by hand for slugs that are still in use", () => {
    writeFileSync(
      join(root, CONFIG),
      readConfig().replace('{ slug: "tech", name: "Tech" }', '{ slug: "tech", name: "Tech Talk" }'),
    );
    writePost("one", "tech", ["writing"]);

    syncTaxonomy({ root, logger: quiet });

    expect(readConfig()).toContain('{ slug: "tech", name: "Tech Talk" }');
  });

  it("does not write anything in a dry run", () => {
    writePost("one", "tech", ["brand-new-tag"]);
    const before = readConfig();

    const result = syncTaxonomy({ root, logger: quiet, dryRun: true })!;

    expect(result.changed).toBe(true);
    expect(readConfig()).toBe(before);
  });

  it("skips the sync when a post's front matter cannot be read", () => {
    mkdirSync(join(root, "src/content/blog/broken"), { recursive: true });
    writeFileSync(join(root, "src/content/blog/broken/index.mdx"), "---\ntags: [unclosed\n---\n");
    const before = readConfig();

    expect(syncTaxonomy({ root, logger: quiet })).toBeNull();
    expect(readConfig()).toBe(before);
  });

  it("makes readable names from slugs", () => {
    expect(displayNameFor("self-hosting")).toBe("Self Hosting");
    expect(displayNameFor("data_ownership")).toBe("Data Ownership");
  });

  it("runs from the command line the way the GitHub Action calls it", () => {
    writePost("one", "tech", ["writing"]);
    const output = execFileSync("node", [join(repoRoot, "scripts/sync-taxonomy.mjs")], {
      cwd: root,
      encoding: "utf8",
    });
    expect(output).toMatch(/theme\.config\.ts: /);
    expect(readConfig()).not.toContain('slug: "life"');
  });
});
