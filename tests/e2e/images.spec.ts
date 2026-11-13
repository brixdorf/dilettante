// Every picture on the blog is offered as JPEG XL and AVIF where those are smaller, smallest first,
// and always in its original format last, for browsers that know neither. Every picture keeps its
// width and height, so nothing moves while it loads.
import { expect, test } from "@playwright/test";
import { builtPages, builtPosts } from "./helpers";

const MODERN = ["image/jxl", "image/avif"];
const ORIGINAL = /\/_pictures\/[\w.-]+\.(jpg|png|webp)$/;

test("every picture on every page is a <picture> ending in its original format", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const problems: string[] = [];
  for (const path of builtPages()) {
    await page.goto(path);
    const images = await page.$$eval("main img, header img", (list) =>
      list.map((img) => ({
        src: img.getAttribute("src") ?? "",
        width: img.getAttribute("width"),
        height: img.getAttribute("height"),
        parent: img.parentElement?.tagName.toLowerCase(),
        sources: [...(img.parentElement?.querySelectorAll("source") ?? [])].map((source) => ({
          type: source.type,
          srcset: source.srcset,
        })),
      })),
    );
    for (const image of images) {
      const where = `${path} ${image.src}`;
      if (!image.width || !image.height) problems.push(`${where} has no width or height`);
      if (image.src.endsWith(".svg")) continue;
      if (image.parent !== "picture") problems.push(`${where} is not in a <picture>`);
      if (!ORIGINAL.test(image.src)) problems.push(`${where} is not in its original format`);
      for (const source of image.sources) {
        if (!MODERN.includes(source.type)) problems.push(`${where} offers ${source.type}`);
        if (!source.srcset.includes("/_pictures/")) problems.push(`${where} has an empty source`);
      }
    }
  }
  expect(problems).toEqual([]);
});

test("pictures written in plain Markdown inside the posts are <picture>s too", async ({ page }) => {
  await page.goto("/blog/finishing-off-what-i-started/");
  const body = page.locator("[data-prose]");
  await expect(body.locator("img").first()).toBeAttached();
  expect(await body.locator("img").count()).toBe(await body.locator("picture > img").count());
});

test("every picture file answers with the right type", async ({ page, request }) => {
  test.setTimeout(120_000);
  const urls = new Set<string>();
  for (const path of ["/", builtPosts()[0], "/blog/finishing-off-what-i-started/"]) {
    await page.goto(path);
    const found = await page.$$eval("picture source, picture img", (list) =>
      list.flatMap((element) =>
        [element.getAttribute("srcset") ?? "", element.getAttribute("src") ?? ""]
          .join(",")
          .split(",")
          .map((part) => part.trim().split(" ")[0])
          .filter(Boolean),
      ),
    );
    found.forEach((url) => urls.add(url));
  }
  const types: Record<string, string> = {
    jxl: "image/jxl",
    avif: "image/avif",
    jpg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
  };
  for (const url of urls) {
    const response = await request.get(url);
    expect(response.status(), url).toBe(200);
    expect(response.headers()["content-type"], url).toBe(types[url.split(".").pop()!]);
  }
});

test("the hero picture loads first, at high priority", async ({ page }) => {
  await page.goto("/");
  const hero = page.locator("main section").first().locator("img");
  await expect(hero).toHaveAttribute("loading", "eager");
  await expect(hero).toHaveAttribute("fetchpriority", "high");
});

test("the lightbox opens the same picture, in a format the browser chose", async ({ page }) => {
  await page.goto("/blog/finishing-off-what-i-started/");
  const first = page.locator("[data-prose] picture img").first();
  await first.scrollIntoViewIfNeeded();
  await expect.poll(() => first.evaluate((img: HTMLImageElement) => img.complete)).toBe(true);
  await first.click();
  const shown = page.locator("[data-lightbox-img]");
  await expect
    .poll(() => shown.evaluate((img: HTMLImageElement) => img.naturalWidth))
    .toBeGreaterThan(0);
});
