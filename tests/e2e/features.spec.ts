// Checks the parts of the Quiet Pages 3.0 design the blog takes over: search, the share sheet, the
// image lightbox, code highlighting, structured data and the index pages.
import { expect, test } from "@playwright/test";
import { LIVE_ORIGIN, builtPages, builtPosts } from "./helpers";

// Romit's profiles, in the order the Contact page lists them.
const PROFILES = [
  "https://github.com/brixdorf",
  "https://x.com/brixdorf",
  "https://www.linkedin.com/in/romitrajsahu",
];

test("Ctrl+K opens search, which finds a post and opens it", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("ControlOrMeta+k");
  const dialog = page.getByRole("dialog", { name: "Search" });
  await expect(dialog).toBeVisible();
  await page.keyboard.type("hardening");
  const result = dialog.getByRole("option", { name: /Server Hardening Guide/ });
  await expect(result).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/blog\/server-hardening-guide\/$/);
});

test("the share sheet offers the post's address", async ({ page }) => {
  const path = builtPosts()[0];
  await page.goto(path);
  await page.getByRole("button", { name: "Share", exact: true }).click();
  const dialog = page.locator("dialog[open]");
  await expect(dialog).toBeVisible();
  await expect(dialog.locator("input")).toHaveValue(`${LIVE_ORIGIN}${path}`);
  await page.keyboard.press("Escape");
  await expect(page.locator("dialog[open]")).toHaveCount(0);
});

test("a picture in a post opens in the lightbox", async ({ page }) => {
  await page.goto("/blog/finishing-off-what-i-started/");
  await page.locator("[data-prose] img").first().click();
  const lightbox = page.getByRole("dialog", { name: "Image viewer" });
  await expect(lightbox).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(lightbox).toBeHidden();
});

test("code blocks are highlighted and can be copied", async ({ page }) => {
  await page.goto("/blog/server-hardening-guide/");
  const block = page.locator("[data-prose] pre").first();
  await expect(block).toHaveClass(/astro-code/);
  await expect(block.locator("span[style]").first()).toBeAttached();
  await expect(page.getByRole("button", { name: "Copy code" }).first()).toBeAttached();
});

test("every page has structured data that matches what it shows", async ({ page }) => {
  test.setTimeout(120_000);
  for (const path of builtPages()) {
    await page.goto(path);
    const blocks = await page.$$eval('script[type="application/ld+json"]', (scripts) =>
      scripts.map((script) => JSON.parse(script.textContent ?? "")),
    );
    expect(blocks.length, path).toBeGreaterThan(0);
    if (builtPosts().includes(path)) {
      const posting = blocks
        .flatMap((block) => block["@graph"] ?? [block])
        .find((item) => item["@type"] === "BlogPosting");
      await expect(page.locator("h1")).toHaveText(posting.headline);
      expect(posting.author.name).toBe("Romit Raj Sahu");
      expect(posting.author.sameAs, path).toEqual(PROFILES);
    }
  }
});

test("the author page names Romit's profiles in its structured data", async ({ page }) => {
  await page.goto("/authors/romit/");
  const blocks = await page.$$eval('script[type="application/ld+json"]', (scripts) =>
    scripts.map((script) => JSON.parse(script.textContent ?? "")),
  );
  const profile = blocks
    .flatMap((block) => block["@graph"] ?? [block])
    .find((item) => item["@type"] === "ProfilePage");
  expect(profile.mainEntity.sameAs).toEqual(PROFILES);
});

test("the footer links to LinkedIn too", async ({ page }) => {
  await page.goto("/");
  const footer = page.locator("footer");
  await expect(
    footer.locator('a[href="https://www.linkedin.com/in/romitrajsahu"] svg'),
  ).toHaveCount(1);
  await expect(footer.locator('a[href="https://x.com/brixdorf"]')).toHaveCount(1);
});

test("posts end with the author note, comments and Keep reading", async ({ page }) => {
  await page.goto(builtPosts()[0]);
  await expect(page.getByRole("complementary", { name: "About the author" })).toBeVisible();
  await expect(page.locator("#remark42")).toBeAttached();
  const related = page.getByRole("region", { name: "Keep reading" });
  await expect(related.locator("[data-post-card]")).toHaveCount(3);
});

test("the Sections, Tags and Contributors pages exist", async ({ page }) => {
  for (const [path, title] of [
    ["/categories/", "Sections"],
    ["/tags/", "Tags"],
    ["/authors/", "Contributors"],
  ]) {
    await page.goto(path);
    await expect(page.locator("h1"), path).toHaveText(title);
  }
});

test("the theme switch changes between light and dark", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/");
  await expect(page.locator("html")).not.toHaveClass(/dark/);
  await page.locator("[data-theme-toggle]:visible").first().click();
  await expect(page.locator("html")).toHaveClass(/dark/);
});
