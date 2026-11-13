// Rybbit (analytics) and Remark42 (comments) must load on the live site only, never while Romit
// works on the blog locally or while these tests run. The second half of this file makes the
// browser believe it is on blog.romitraj.dev to check they still load there.
import { expect, test } from "@playwright/test";
import {
  ANALYTICS_ORIGIN,
  COMMENTS_ORIGIN,
  LIVE_ORIGIN,
  builtPages,
  builtPosts,
  commentsAddress,
  pretendToBeLive,
  watchThirdParties,
} from "./helpers";

const RYBBIT_SITE_ID = "baf839ddf444";

test("no page contacts the analytics or comments servers locally", async ({ page }) => {
  test.setTimeout(120_000);
  const requests = await watchThirdParties(page);
  for (const path of builtPages()) {
    await page.goto(path, { waitUntil: "load" });
  }
  expect(requests).toEqual([]);
});

test.describe("on the live site", () => {
  test("every page loads Rybbit with the blog's site ID", async ({ page, baseURL }) => {
    await pretendToBeLive(page, baseURL!);
    const requests = await watchThirdParties(page);
    for (const path of ["/", "/about/", builtPosts()[0]]) {
      requests.length = 0;
      await page.goto(`${LIVE_ORIGIN}${path}`, { waitUntil: "load" });
      await expect
        .poll(() => requests.filter((url) => url.startsWith(ANALYTICS_ORIGIN)))
        .toEqual([`${ANALYTICS_ORIGIN}/api/script.js`]);
      await expect(page.locator(`script[src="${ANALYTICS_ORIGIN}/api/script.js"]`)).toHaveAttribute(
        "data-site-id",
        RYBBIT_SITE_ID,
      );
    }
  });

  test("pages other than posts do not load comments", async ({ page, baseURL }) => {
    await pretendToBeLive(page, baseURL!);
    const requests = await watchThirdParties(page);
    await page.goto(`${LIVE_ORIGIN}/about/`, { waitUntil: "load" });
    expect(requests.filter((url) => url.startsWith(COMMENTS_ORIGIN))).toEqual([]);
  });

  for (const index of [0, 1, 2, 3, 4]) {
    test(`post ${index + 1} loads Remark42 with its old address, without a trailing slash`, async ({
      page,
      baseURL,
    }) => {
      const path = builtPosts()[index];
      await pretendToBeLive(page, baseURL!);
      const requests = await watchThirdParties(page);
      await page.goto(`${LIVE_ORIGIN}${path}`, { waitUntil: "load" });

      await expect
        .poll(() => requests.some((url) => url.startsWith(`${COMMENTS_ORIGIN}/web/embed`)))
        .toBe(true);
      await expect(page.locator("#remark42")).toBeAttached();
      const config = await page.evaluate(() => {
        const remark = (window as unknown as { remark_config: Record<string, string> })
          .remark_config;
        return { host: remark.host, site_id: remark.site_id, url: remark.url };
      });
      expect(config).toEqual({
        host: COMMENTS_ORIGIN,
        site_id: "dilettante",
        url: commentsAddress(path),
      });
    });
  }

  test("comments start in the page's colour scheme and follow the theme switch", async ({
    page,
    baseURL,
  }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await pretendToBeLive(page, baseURL!);
    await watchThirdParties(page);
    await page.addInitScript(() => {
      const calls: string[] = [];
      Object.defineProperty(window, "REMARK42", {
        value: { changeTheme: (theme: string) => calls.push(theme), calls },
        writable: false,
      });
    });
    await page.goto(`${LIVE_ORIGIN}${builtPosts()[0]}`, { waitUntil: "load" });

    const startTheme = await page.evaluate(
      () => (window as unknown as { remark_config: { theme: string } }).remark_config.theme,
    );
    expect(startTheme).toBe("dark");

    await page.locator("[data-theme-toggle]:visible").first().click();
    const calls = () =>
      page.evaluate(() => (window as unknown as { REMARK42: { calls: string[] } }).REMARK42.calls);
    await expect.poll(calls).toEqual(["light"]);
    await page.locator("[data-theme-toggle]:visible").first().click();
    await expect.poll(calls).toEqual(["light", "dark"]);
  });
});
