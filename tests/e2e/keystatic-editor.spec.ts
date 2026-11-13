// Checks Keystatic in local mode, on the development server: the admin lists the posts, and saving
// writes exactly the same file format as the real posts (which were all saved by Keystatic).
// Every test works on a temporary copy or a temporary post, deleted again at the end.
import { cpSync, existsSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";

const blogDir = join(import.meta.dirname, "..", "..", "src", "content", "blog");
const TEST_PREFIX = "zz-test-";
const realPosts = () =>
  readdirSync(blogDir)
    .filter((slug) => !slug.startsWith(TEST_PREFIX))
    .sort();

const removeTestPosts = () => {
  for (const slug of readdirSync(blogDir).filter((name) => name.startsWith(TEST_PREFIX))) {
    rmSync(join(blogDir, slug), { recursive: true, force: true });
  }
};

test.beforeAll(removeTestPosts);
test.afterAll(removeTestPosts);

const waitForFile = async (path: string, changedFrom?: string) => {
  await expect
    .poll(() => (existsSync(path) ? readFileSync(path, "utf8") : undefined), { timeout: 15_000 })
    .not.toBe(changedFrom);
  return readFileSync(path, "utf8");
};

test("Keystatic runs in local mode in development", async ({ request }) => {
  const tree = await request.get("/api/keystatic/tree", { headers: { "no-cors": "1" } });
  expect(tree.ok()).toBe(true);
  expect(Array.isArray(await tree.json())).toBe(true);

  const login = await request.get("/api/keystatic/github/login", { maxRedirects: 0 });
  expect(login.status()).toBe(404);
});

test("the admin lists the five posts", async ({ page }) => {
  await page.goto("/keystatic/collection/blog");
  for (const slug of realPosts()) {
    await expect(page.getByText(slug, { exact: true })).toBeVisible();
  }
});

for (const slug of realPosts()) {
  test(`saving "${slug}" writes the file back exactly as it was, apart from the edit`, async ({
    page,
  }) => {
    const copy = `${TEST_PREFIX}${slug}`;
    cpSync(join(blogDir, slug), join(blogDir, copy), { recursive: true });
    const file = join(blogDir, copy, "index.mdx");
    const original = readFileSync(file, "utf8");
    const files = readdirSync(join(blogDir, copy)).sort();

    await page.goto(`/keystatic/collection/blog/item/${copy}`);
    const excerpt = page.getByLabel(/^Excerpt/);
    await expect(excerpt).not.toHaveValue("");
    const edited = `${await excerpt.inputValue()} (edited)`;
    await excerpt.fill(edited);
    await page.getByRole("button", { name: "Save" }).click();

    const saved = await waitForFile(file, original);
    expect(saved).toBe(original.replace(/^excerpt: .*$/m, `excerpt: ${JSON.stringify(edited)}`));
    expect(readdirSync(join(blogDir, copy)).sort()).toEqual(files);
  });
}

test("a new post is saved in the same format as the real posts", async ({ page }) => {
  const slug = `${TEST_PREFIX}keystatic-new-post`;
  await page.goto("/keystatic/collection/blog/create");

  await page.getByLabel(/^Title/).fill("ZZ Test Keystatic new post");
  await page.getByLabel(/^Excerpt/).fill('An excerpt with "quotes" in it');
  await page.getByLabel(/^Published date/).fill("2026-01-02");
  await page.getByLabel(/^Category/).fill("tech");
  for (const tag of ["writing", "habits"]) {
    await page.getByRole("button", { name: "Add", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel(/^Tag/).fill(tag);
    await dialog.getByRole("button", { name: "Add", exact: true }).click();
    await expect(dialog).toBeHidden();
  }
  // Author is a choice of the configured authors; Romit is the only one, chosen already.
  await expect(page.getByRole("button", { name: /Romit Raj Sahu/ })).toBeVisible();
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Choose file" }).click();
  await (await chooser).setFiles(join(blogDir, "hello-there", "waving_hand.png"));
  await page.getByLabel(/^Thumbnail alt text/).fill("A waving hand.");
  await page.getByLabel(/^Caption/).fill("A caption.");
  await page.getByLabel(/^Photographer$/).fill("Someone");
  await page.getByLabel(/^Photographer URL/).fill("https://example.com/someone");
  await page.getByLabel(/^Source$/).fill("Example");
  await page.getByLabel(/^Source URL/).fill("https://example.com/");
  await page.locator('[contenteditable="true"]').first().click();
  await page.keyboard.type("Hello from the test.");
  await page.getByRole("button", { name: "Create" }).click();

  const saved = await waitForFile(join(blogDir, slug, "index.mdx"));
  expect(saved).toBe(
    [
      "---",
      'title: "ZZ Test Keystatic new post"',
      'excerpt: "An excerpt with \\"quotes\\" in it"',
      "date: 2026-01-02",
      'category: "tech"',
      'tags: ["writing", "habits"]',
      'author: "romit"',
      "thumbnail: ./waving-hand.png",
      'thumbnailAlt: "A waving hand."',
      "imageCredit:",
      '  caption: "A caption."',
      '  author: "Someone"',
      '  authorUrl: "https://example.com/someone"',
      '  source: "Example"',
      '  sourceUrl: "https://example.com/"',
      "---",
      "",
      "Hello from the test.",
      "",
    ].join("\n"),
  );
  expect(existsSync(join(blogDir, slug, "waving-hand.png"))).toBe(true);
});
