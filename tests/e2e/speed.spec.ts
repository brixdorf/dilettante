// PageSpeed-style checks: nothing on a page moves while it loads (cumulative layout shift), and
// nothing in the head holds back the first paint that need not. Layout shift is measured by
// Chromium only.
import { expect, test } from "@playwright/test";
import { builtPosts } from "./helpers";

const pages = () => ["/", "/blog/", "/about/", "/contact/", ...builtPosts()];

for (const width of [1440, 390]) {
  test(`nothing moves while pages load, at ${width} pixels wide`, async ({ page, browserName }) => {
    test.skip(browserName !== "chromium", "Only Chromium measures layout shift.");
    test.setTimeout(120_000);
    await page.setViewportSize({ width, height: 900 });
    for (const path of pages()) {
      await page.goto(path, { waitUntil: "load" });
      await page.evaluate(() => document.fonts.ready);
      // Scroll to the end and back, so lazy pictures load too.
      await page.evaluate(async () => {
        for (let y = 0; y < document.documentElement.scrollHeight; y += 600) {
          window.scrollTo(0, y);
          await new Promise((done) => setTimeout(done, 60));
        }
        window.scrollTo(0, 0);
      });
      await page.waitForTimeout(500);
      const shift = await page.evaluate(
        () =>
          new Promise<number>((done) => {
            let total = 0;
            new PerformanceObserver((list) => {
              for (const entry of list.getEntries() as (PerformanceEntry & {
                value: number;
                hadRecentInput: boolean;
              })[])
                if (!entry.hadRecentInput) total += entry.value;
            }).observe({ type: "layout-shift", buffered: true });
            setTimeout(() => done(total), 200);
          }),
      );
      expect(shift, `${path} at ${width}px`).toBeLessThan(0.01);
    }
  });
}

test("the head holds back the first paint with nothing but the site's own styles", async ({
  page,
}) => {
  for (const path of pages()) {
    await page.goto(path);
    const blocking = await page.$$eval("head script[src], head link[rel='stylesheet']", (list) =>
      list
        .filter((element) =>
          element.tagName === "SCRIPT"
            ? !(element as HTMLScriptElement).async &&
              !(element as HTMLScriptElement).defer &&
              (element as HTMLScriptElement).type !== "module"
            : !(element as HTMLLinkElement).href.startsWith(location.origin),
        )
        .map((element) => element.outerHTML),
    );
    expect(blocking, path).toEqual([]);
  }
});

test("the fonts above the fold are preloaded", async ({ page }) => {
  await page.goto("/");
  const preloaded = await page.$$eval('link[rel="preload"][as="font"]', (list) =>
    list.map((link) => (link as HTMLLinkElement).getAttribute("href")),
  );
  expect(preloaded).toEqual([
    "/fonts/newsreader/newsreader-latin.woff2",
    "/fonts/geist/Geist-Variable.woff2",
  ]);
});
