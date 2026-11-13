// Tests the small list of post dates the Keystatic admin sorts its Blog posts list by. It is read
// from each post's front matter when the blog is built, and holds nothing else from the posts.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vite-plus/test";
import postDates, { readPostDates } from "../../scripts/post-dates.mjs";

const folders: string[] = [];

const blogWith = (posts: Record<string, string>) => {
  const blogDir = mkdtempSync(join(tmpdir(), "dilettante-post-dates-"));
  folders.push(blogDir);
  for (const [slug, source] of Object.entries(posts)) {
    mkdirSync(join(blogDir, slug));
    writeFileSync(join(blogDir, slug, "index.mdx"), source);
  }
  return blogDir;
};

afterEach(() => {
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true });
});

describe("readPostDates", () => {
  it("maps each post's folder name to its published date, read from the front matter", () => {
    const blogDir = blogWith({
      "plain-date": '---\ntitle: "One"\ndate: 2026-03-16\n---\n\nBody.\n',
      "quoted-date": '---\ntitle: "Two"\ndate: "2026-07-29"\n---\n\nBody.\n',
      "body-mentions-a-date": "---\ndate: 2026-01-02\n---\n\n---\ndate: 1999-01-01\n---\n",
    });

    expect(readPostDates(blogDir)).toEqual({
      "body-mentions-a-date": Date.UTC(2026, 0, 2),
      "plain-date": Date.UTC(2026, 2, 16),
      "quoted-date": Date.UTC(2026, 6, 29),
    });
  });

  it("leaves out folders without a post or without a readable date", () => {
    const blogDir = blogWith({
      "no-date": '---\ntitle: "No date"\n---\n',
      "bad-date": "---\ndate: someday\n---\n",
      "no-front-matter": "Just a body.\n",
    });
    mkdirSync(join(blogDir, "empty-folder"));

    expect(readPostDates(blogDir)).toEqual({});
  });

  it("is empty when there is no blog folder", () => {
    expect(readPostDates(join(tmpdir(), "dilettante-no-such-folder"))).toEqual({});
  });
});

describe("the post dates module", () => {
  it("holds only the folder names and dates, not the posts", async () => {
    const body = "A long post body that must not reach the admin.";
    const root = blogWith({});
    mkdirSync(join(root, "src", "content", "blog", "a-post"), { recursive: true });
    writeFileSync(
      join(root, "src", "content", "blog", "a-post", "index.mdx"),
      `---\ntitle: "A post"\ndate: 2026-03-16\n---\n\n${body}\n`,
    );

    const plugin = postDates();
    plugin.configResolved({ root });
    const id = plugin.resolveId("virtual:post-dates");
    const code = plugin.load(id as string) as string;

    expect(code).not.toContain(body);
    expect(code).not.toContain("A post");
    expect(code).toBe(`export default ${JSON.stringify({ "a-post": Date.UTC(2026, 2, 16) })};`);
  });
});
