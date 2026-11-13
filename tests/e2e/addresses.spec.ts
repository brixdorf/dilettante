// Every address ends in a slash. The old addresses, without the slash, must keep working: links
// already shared answer with a permanent redirect (301) to the new address. Canonical tags and
// Open Graph addresses use the new form.
import { expect, test } from "@playwright/test";
import { LIVE_ORIGIN, builtPages, builtPosts } from "./helpers";

const oldAddresses = () => [
  "/about",
  "/contact",
  "/blog",
  "/authors/romit",
  "/categories/tech",
  "/tags/server",
  ...builtPosts().map((path) => path.replace(/\/$/, "")),
];

test("old addresses without a trailing slash answer with a permanent redirect", async ({
  request,
}) => {
  for (const path of oldAddresses()) {
    const response = await request.get(path, { maxRedirects: 0 });
    expect(response.status(), path).toBe(301);
    expect(new URL(response.headers()["location"], LIVE_ORIGIN).pathname, path).toBe(`${path}/`);
  }
});

test("a redirect keeps the query string", async ({ request }) => {
  const response = await request.get("/blog?q=server", { maxRedirects: 0 });
  expect(response.status()).toBe(301);
  expect(response.headers()["location"]).toMatch(/\/blog\/\?q=server$/);
});

test("the feed, the sitemap and robots.txt are not redirected", async ({ request }) => {
  for (const path of ["/rss.xml", "/sitemap.xml", "/robots.txt"]) {
    expect((await request.get(path, { maxRedirects: 0 })).status(), path).toBe(200);
  }
});

test("every page's canonical and Open Graph addresses are absolute and end in a slash", async ({
  page,
}) => {
  test.setTimeout(120_000);
  for (const path of builtPages()) {
    await page.goto(path);
    const head = await page.evaluate(() => ({
      canonical: document.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href,
      ogUrl: document.querySelector<HTMLMetaElement>('meta[property="og:url"]')?.content,
      ogImage: document.querySelector<HTMLMetaElement>('meta[property="og:image"]')?.content,
      twitterImage: document.querySelector<HTMLMetaElement>('meta[name="twitter:image"]')?.content,
    }));
    expect(head.canonical, path).toBe(`${LIVE_ORIGIN}${path}`);
    expect(head.ogUrl, path).toBe(`${LIVE_ORIGIN}${path}`);
    expect(head.ogImage, path).toMatch(new RegExp(`^${LIVE_ORIGIN}/`));
    expect(head.twitterImage, path).toBe(head.ogImage);
  }
});

test("internal links point to the new addresses", async ({ page }) => {
  test.setTimeout(120_000);
  const stale: string[] = [];
  for (const path of builtPages()) {
    await page.goto(path);
    const hrefs = await page.$$eval("a[href^='/']", (links) =>
      links.map((link) => link.getAttribute("href") ?? ""),
    );
    for (const href of hrefs) {
      const { pathname } = new URL(href, LIVE_ORIGIN);
      if (!pathname.endsWith("/") && !/\.[a-z0-9]+$/i.test(pathname))
        stale.push(`${path} links to ${href}`);
    }
  }
  expect(stale).toEqual([]);
});

test("the page for a missing address names no canonical address of its own", async ({ page }) => {
  await page.goto("/this-page-does-not-exist/");
  await expect(page.locator('link[rel="canonical"]')).toHaveCount(0);
  await expect(page.locator('meta[property="og:url"]')).toHaveCount(0);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex, follow");
});
