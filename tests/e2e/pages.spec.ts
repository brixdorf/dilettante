// Opens every page of the built blog and checks it loads cleanly: no error answers, no failed
// files, no script errors.
import { expect, test } from "@playwright/test";
import { builtPages, builtPosts, watchThirdParties } from "./helpers";

test("the build has the home page, the archive, About, Contact and all five posts", () => {
  const pages = builtPages();
  for (const path of ["/", "/about", "/contact", "/blog"]) {
    expect(pages.map((page) => page.replace(/\/$/, "") || "/")).toContain(path);
  }
  expect(builtPosts()).toHaveLength(5);
});

test("every page loads without errors", async ({ page }) => {
  test.setTimeout(120_000);
  await watchThirdParties(page);
  const problems: string[] = [];
  const where = () => new URL(page.url()).pathname;

  page.on("console", (message) => {
    if (message.type() === "error") problems.push(`${where()}: console error: ${message.text()}`);
  });
  page.on("pageerror", (error) => problems.push(`${where()}: script error: ${error.message}`));
  page.on("requestfailed", (request) =>
    problems.push(`${where()}: ${request.url()} failed: ${request.failure()?.errorText}`),
  );
  page.on("response", (response) => {
    if (response.status() >= 400)
      problems.push(`${where()}: ${response.url()} answered ${response.status()}`);
  });

  for (const path of builtPages()) {
    const response = await page.goto(path, { waitUntil: "load" });
    if (!response?.ok()) problems.push(`${path} answered ${response?.status()}`);
    await expect(page.locator("h1").first()).toBeVisible();
  }

  expect(problems).toEqual([]);
});

test("an unknown address answers 404 with the blog's own page", async ({ page }) => {
  const response = await page.goto("/this-page-does-not-exist");
  expect(response?.status()).toBe(404);
  await expect(page.locator("h1").first()).toBeVisible();
});
