// Romit's words must appear exactly as he wrote them, and nothing from the theme's demo may be
// left. Also checks the footer, the email address, the Contact page's OpenPGP card and the two
// links removed from posts because their sites are gone.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { builtPages } from "./helpers";

const SITE_NAME = "A Dilettante's Journal";
const EMAIL = "hi@romitraj.dev";
const keyFile = join(import.meta.dirname, "..", "..", "public", "romitraj-pgp-public.asc");

const mainText = async (page: Page) =>
  (await page.locator("main").innerText()).replace(/\s+/g, " ").trim();

test.describe("Romit's words", () => {
  test("the home page hero", async ({ page }) => {
    await page.goto("/");
    const title = page.locator("h1");
    await expect(title).toHaveText(
      "A digital journal containing the collection of little tidbits, I feel are worth sharing.",
    );
    await expect(title.locator("em")).toHaveText(["tidbits", "sharing"]);
    await expect(
      page.getByText("Tech, non-tech, whatever I feel like writing at the moment.", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "Begin with my latest banger" })).toBeVisible();
    await expect(page.getByText("Read the entry", { exact: true })).toBeVisible();
  });

  test("the site name and description", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("header").first()).toContainText(SITE_NAME);
    await expect(page.locator('meta[name="description"]')).toHaveAttribute(
      "content",
      "A digital recollection of my ramblings",
    );
    await expect(page.locator("footer")).toContainText("A digital recollection of my ramblings");
  });

  test("the About page", async ({ page }) => {
    await page.goto("/about/");
    await expect(page.locator("h1")).toHaveText(
      "A place for the great escape from online echo chambers.",
    );
    const text = await mainText(page);
    for (const line of [
      `Sometimes the constant bombardment of social media and our afflictions in life lead us to escape to a place distant from these conundrums. ${SITE_NAME} began as a little project of mine where I could share my thoughts and my progress in the field of tech and life.`,
      "Topics may diverge, consistency is not a promise, but you have to excuse me for that. Trust me, I try my best.",
      "I always remember this in my mind,",
      "Act > Think",
      "Author",
      "Romit Raj Sahu",
      "Lifelong learner",
    ]) {
      expect(text).toContain(line);
    }
    await expect(page.getByRole("heading", { name: "Act > Think" })).toBeVisible();
  });

  test("the Contact page", async ({ page }) => {
    await page.goto("/contact/");
    await expect(page.locator("h1")).toHaveText("Say hello.");
    const text = await mainText(page);
    expect(text).toContain("Notes, corrections, or just a thought. I read everything.");
    expect(text).toContain("Find Me Here");
    await expect(page.locator(`main a[href="mailto:${EMAIL}"]`).first()).toBeVisible();
  });

  test("the archive", async ({ page }) => {
    await page.goto("/blog/");
    expect(await mainText(page)).toContain("Every piece I've published. 5 bangers.");
    await expect(page.locator('meta[name="description"]')).toHaveAttribute(
      "content",
      "Every piece I've published. Search and filter by category or tag.",
    );
  });

  test("the author", async ({ page }) => {
    await page.goto("/authors/romit/");
    await expect(page.locator("h1")).toHaveText("Romit Raj Sahu");
    const text = await mainText(page);
    expect(text).toContain(
      "I have interests in lots of avenues of science, literature and life. I like to share my experiences and journey with others through writing. Watch, Learn, and Grow. Act > Think",
    );
    expect(text).toContain("Lifelong learner");
    await expect(page.locator('meta[name="description"]')).toHaveAttribute(
      "content",
      "I write about tech and non-tech whenever I feel like it.",
    );
    await expect(page.locator('main img[src="/avatars/romit.svg"]').first()).toBeVisible();
  });
});

test("the footer's bottom row is only the copyright line, with this year", async ({ page }) => {
  await page.goto("/");
  const row = page.locator("footer [data-footer-bottom]");
  await expect(row).toHaveText(`© ${new Date().getFullYear()} ${SITE_NAME}.`);
});

test("every page uses hi@romitraj.dev and nothing is left from the theme's demo", async ({
  page,
}) => {
  test.setTimeout(120_000);
  for (const path of builtPages()) {
    await page.goto(path);
    const html = await page.content();
    expect(html, path).not.toContain("itsromit@protonmail.com");
    expect(html, path).not.toMatch(/Elena March|Samuel Okafor|Mira Iwasaki|Quiet Pages/);
    // The page's own words, outside the post body (a post may mention a newsletter).
    const text = await page.evaluate(() => {
      const body = document.body.cloneNode(true) as HTMLElement;
      body.querySelectorAll("script, style, template, [data-prose]").forEach((el) => el.remove());
      return body.textContent ?? "";
    });
    expect(text, path).not.toMatch(/magazine|newsletter|subscribe|essay|editors?\b/i);
    // No photos of people: the only portrait is Romit's drawn avatar.
    const images = await page.$$eval("img", (list) => list.map((img) => img.getAttribute("src")));
    for (const src of images) expect(src ?? "", path).not.toMatch(/authors\/|about\./);
  }
});

test("there are no forms to send email through", async ({ page }) => {
  for (const path of ["/", "/contact/", "/about/"]) {
    await page.goto(path);
    await expect(page.locator("main form"), path).toHaveCount(0);
  }
  await page.goto("/");
  await expect(page.locator(`footer a[href="mailto:${EMAIL}"]`)).toHaveCount(1);
});

test("the two dead links are gone from the posts, but their words stay", async ({ page }) => {
  await page.goto("/blog/finishing-off-what-i-started/");
  await expect(page.locator("[data-prose] a[href*='didiread']")).toHaveCount(0);
  await expect(page.locator("[data-prose]")).toContainText(
    "Finally, I was able to access my website at didiread.romitraj.dev. The login worked",
  );

  await page.goto("/blog/why-you-should-own-a-server/");
  await expect(page.locator("[data-prose] a[href*='pngfolio']")).toHaveCount(0);
  await expect(page.locator("[data-prose]")).toContainText("Red arrow by Ilustrația Botanică");
});

test.describe("the OpenPGP card on the Contact page", () => {
  test("shows the key's facts, read from the key file", async ({ page }) => {
    await page.goto("/contact/");
    const card = page.locator("[data-pgp-card]");
    await expect(card.getByRole("heading", { name: "OpenPGP" })).toBeVisible();
    await expect(card).toContainText("Fingerprint");
    await expect(card).toContainText("010F 1F08 E31C AFDB 78E1 AEEC CF7E F21B CBB8 D0BB");
    await expect(card).toContainText("Key ID");
    await expect(card).toContainText("CF7EF21BCBB8D0BB");
    await expect(card).toContainText("Ed25519 (signing) and Curve25519 (encryption)");
    await expect(card).toContainText("Expires");
    await expect(card.locator('time[datetime="2029-09-28"]')).toHaveText("2029-09-28");
    await expect(card).not.toContainText("keys.openpgp.org");
    await expect(card.locator("a[href*='keys.openpgp.org']")).toHaveCount(0);
  });

  test("offers the key for download", async ({ page, request }) => {
    await page.goto("/contact/");
    const link = page.locator("[data-pgp-card]").getByRole("link", { name: "Download key" });
    await expect(link).toHaveAttribute("download", "");
    const href = (await link.getAttribute("href"))!;
    const response = await request.get(href);
    expect(response.ok()).toBe(true);
    expect(await response.text()).toBe(readFileSync(keyFile, "utf8"));
  });

  test("copies the gpg command", async ({ page, context, browserName }) => {
    test.skip(browserName !== "chromium", "Reading the clipboard back works in Chromium only.");
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.goto("/contact/");
    const card = page.locator("[data-pgp-card]");
    await expect(card.locator("code")).toHaveText(`gpg --locate-external-keys ${EMAIL}`);
    await card.getByRole("button", { name: "Copy the command" }).click();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
      `gpg --locate-external-keys ${EMAIL}`,
    );
    await expect(card.getByRole("button", { name: "Copy the command" })).toHaveText("Copied");
  });
});
