// Checks the files other sites and search engines read: the RSS feed (romitraj.dev and the GitHub
// profile README show the latest posts from it), the sitemap and robots.txt.
import { expect, test } from "@playwright/test";
import { LIVE_ORIGIN, builtPosts } from "./helpers";

const tagText = (xml: string, tag: string) =>
  xml
    .match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`))?.[1]
    ?.trim()
    .replace(/^<!\[CDATA\[([\s\S]*)\]\]>$/, "$1");

test.describe("the RSS feed at /rss.xml", () => {
  test("has an item for every post with a title, link, description and date", async ({
    request,
  }) => {
    const response = await request.get("/rss.xml");
    expect(response.ok()).toBe(true);
    expect(response.headers()["content-type"]).toMatch(/xml/);

    const xml = await response.text();
    const items = xml.match(/<item>[\s\S]*?<\/item>/g) ?? [];
    expect(items).toHaveLength(5);

    const links: string[] = [];
    for (const item of items) {
      expect(tagText(item, "title")).toBeTruthy();
      expect(tagText(item, "description")).toBeTruthy();
      const pubDate = tagText(item, "pubDate") ?? "";
      expect(Number.isNaN(Date.parse(pubDate))).toBe(false);
      links.push(tagText(item, "link") ?? "");
    }
    expect(links.sort()).toEqual(builtPosts().map((path) => `${LIVE_ORIGIN}${path}`));
  });

  test("lists the newest post first", async ({ request }) => {
    const xml = await (await request.get("/rss.xml")).text();
    const dates = [...xml.matchAll(/<pubDate>([^<]+)<\/pubDate>/g)].map((m) => Date.parse(m[1]));
    expect(dates).toEqual([...dates].sort((a, b) => b - a));
  });
});

test("the sitemap lists only the home page, archive, About, Contact, the posts and the author", async ({
  request,
}) => {
  const response = await request.get("/sitemap.xml");
  expect(response.ok()).toBe(true);
  const xml = await response.text();
  expect(xml).toContain("<urlset");
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]).sort();
  const expected = ["/", "/blog/", "/about/", "/contact/", "/authors/romit/", ...builtPosts()];
  expect(locs).toEqual(expected.map((path) => `${LIVE_ORIGIN}${path}`).sort());
});

test("robots.txt exists, blocks nothing and points to the sitemap", async ({ request }) => {
  const response = await request.get("/robots.txt");
  expect(response.ok()).toBe(true);
  const text = await response.text();
  expect(text).toMatch(/^User-agent: \*$/m);
  expect(text).not.toMatch(/^Disallow:\s*\S/m);
  expect(text).toContain(`Sitemap: ${LIVE_ORIGIN}/sitemap.xml`);
});
