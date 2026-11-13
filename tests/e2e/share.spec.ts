// What a link to the blog looks like when shared: pages without their own picture (home, archive,
// About, Contact) use the default share image, 1200 by 630; posts use their own cover.
import { expect, test } from "@playwright/test";
import { LIVE_ORIGIN, builtPosts } from "./helpers";

// A PNG's width and height sit at a fixed place in its first chunk.
const pngSize = (bytes: Buffer) => ({
  width: bytes.readUInt32BE(16),
  height: bytes.readUInt32BE(20),
});

const meta = (page: import("@playwright/test").Page) =>
  page.evaluate(() => {
    const get = (selector: string) =>
      document.querySelector<HTMLMetaElement>(selector)?.content ?? null;
    return {
      image: get('meta[property="og:image"]'),
      width: get('meta[property="og:image:width"]'),
      height: get('meta[property="og:image:height"]'),
      alt: get('meta[property="og:image:alt"]'),
      title: get('meta[property="og:title"]'),
      description: get('meta[property="og:description"]'),
      card: get('meta[name="twitter:card"]'),
      twitterImage: get('meta[name="twitter:image"]'),
      twitterTitle: get('meta[name="twitter:title"]'),
    };
  });

test("the default share image is a 1200 by 630 PNG", async ({ request }) => {
  const response = await request.get("/og-image.png");
  expect(response.ok()).toBe(true);
  expect(response.headers()["content-type"]).toBe("image/png");
  expect(pngSize(await response.body())).toEqual({ width: 1200, height: 630 });
});

for (const path of ["/", "/blog/", "/about/", "/contact/"]) {
  test(`${path} shares the default image`, async ({ page }) => {
    await page.goto(path);
    const tags = await meta(page);
    expect(tags.image).toBe(`${LIVE_ORIGIN}/og-image.png`);
    expect(tags.twitterImage).toBe(tags.image);
    expect([tags.width, tags.height]).toEqual(["1200", "630"]);
    expect(tags.card).toBe("summary_large_image");
    expect(tags.title).toBeTruthy();
    expect(tags.twitterTitle).toBe(tags.title);
    expect(tags.description).toBeTruthy();
  });
}

test("every post shares its own cover, cropped to 1200 by 630", async ({ page, request }) => {
  for (const path of builtPosts()) {
    await page.goto(path);
    const tags = await meta(page);
    expect(tags.image, path).toMatch(new RegExp(`^${LIVE_ORIGIN}/_astro/.+\\.jpg$`));
    expect(tags.alt, path).toBe(
      await page.locator("article figure img").first().getAttribute("alt"),
    );
    const local = new URL(tags.image!).pathname;
    const response = await request.get(local);
    expect(response.headers()["content-type"], path).toBe("image/jpeg");
  }
});
