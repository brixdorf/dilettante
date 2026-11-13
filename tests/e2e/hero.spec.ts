// The home page's hero: the mountain photo must be clearly visible, in light and dark mode, while
// the headline, the lead line and both buttons stay easy to read. Contrast is measured the WCAG way,
// against the real pixels behind each piece of text: the page is drawn with the text made
// invisible, and every pixel under each line of text is compared with the text's colour. The
// worst pixel counts. Pixels are read by Chromium only, so the other browsers skip these tests.
import { expect, test, type Page } from "@playwright/test";
import sharp from "sharp";

type Rgb = [number, number, number];
type Rect = { x: number; y: number; width: number; height: number };
interface Target {
  name: string;
  minimum: number;
  color: Rgb;
  rects: Rect[];
}

// Relative luminance and contrast ratio, as WCAG 2 defines them.
const channel = (value: number) => {
  const c = value / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
const luminance = ([r, g, b]: Rgb) =>
  0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
const contrast = (a: Rgb, b: Rgb) => {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
};
const parseRgb = (css: string): Rgb => {
  const [r, g, b] = css.match(/[\d.]+/g)!.map(Number);
  return [r, g, b];
};

const shoot = async (page: Page) => {
  const { data, info } = await sharp(
    await page.screenshot({ fullPage: true, animations: "disabled" }),
  )
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const at = (x: number, y: number): Rgb => {
    const i = (y * info.width + x) * 3;
    return [data[i], data[i + 1], data[i + 2]];
  };
  return { at, width: info.width, height: info.height };
};

const pixelsIn = (rect: Rect, width: number, height: number) => {
  const points: [number, number][] = [];
  for (let y = Math.max(0, Math.ceil(rect.y)); y < Math.min(height, rect.y + rect.height); y++)
    for (let x = Math.max(0, Math.ceil(rect.x)); x < Math.min(width, rect.x + rect.width); x++)
      points.push([x, y]);
  return points;
};

const openHome = async (page: Page, scheme: "light" | "dark", width: number) => {
  await page.emulateMedia({ colorScheme: scheme });
  await page.setViewportSize({ width, height: 900 });
  await page.goto("/");
  await page.evaluate(() => document.fonts.ready);
  // As a visitor sees it, once the text has risen into place.
  await page.evaluate(() =>
    Promise.all(document.getAnimations().map((animation) => animation.finished)),
  );
  await page
    .locator("h1")
    .locator("xpath=ancestor::section[1]")
    .locator("img")
    .first()
    .evaluate((img: HTMLImageElement) => img.decode());
};

// Where each piece of hero text sits, line by line, and its colour.
const targets = (page: Page) =>
  page.evaluate(() => {
    const hero = document.querySelector("h1")!.closest("section")!;
    const linesOf = (element: Element) => {
      const rects: { x: number; y: number; width: number; height: number }[] = [];
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (!node.textContent?.trim()) continue;
        const range = document.createRange();
        range.selectNodeContents(node);
        for (const rect of range.getClientRects())
          rects.push({
            x: rect.x + scrollX,
            y: rect.y + scrollY,
            width: rect.width,
            height: rect.height,
          });
      }
      return rects;
    };
    const target = (name: string, element: Element, minimum: number) => ({
      name,
      minimum,
      color: getComputedStyle(element).color,
      rects: linesOf(element),
    });
    return [
      target("headline", hero.querySelector("h1")!, 3),
      target("lead line", hero.querySelector("h1 + p")!, 4.5),
      ...[...hero.querySelectorAll(".btn")].map((button, index) =>
        target(`button ${index + 1}`, button, 4.5),
      ),
    ];
  });

const hideText = (page: Page) =>
  page.addStyleTag({
    content: `section:has(> div > h1) :is(h1, h1 *, p, .btn, .btn *) {
      color: transparent !important; -webkit-text-fill-color: transparent !important; }`,
  });

for (const scheme of ["light", "dark"] as const) {
  for (const width of [1440, 390]) {
    test(`the hero's text is easy to read over the photo, in ${scheme} mode at ${width} pixels`, async ({
      page,
      browserName,
    }) => {
      test.skip(browserName !== "chromium", "Pixels are read in Chromium only.");
      await openHome(page, scheme, width);
      const pieces: Target[] = (await targets(page)).map((piece) => ({
        ...piece,
        color: parseRgb(piece.color),
      }));
      expect(pieces.length).toBe(4);
      // Nothing is drawn over the text: every line still has pixels in the text's own colour.
      const drawn = await shoot(page);
      for (const piece of pieces)
        for (const rect of piece.rects) {
          let nearest = Infinity;
          for (const [x, y] of pixelsIn(rect, drawn.width, drawn.height)) {
            const pixel = drawn.at(x, y);
            nearest = Math.min(
              nearest,
              Math.max(...pixel.map((v, c) => Math.abs(v - piece.color[c]))),
            );
          }
          expect(nearest, `${piece.name}, the line at ${Math.round(rect.y)}`).toBeLessThanOrEqual(
            12,
          );
        }
      await hideText(page);
      const shot = await shoot(page);
      const results = pieces.map((piece) => {
        let worst = Infinity;
        for (const rect of piece.rects)
          for (const [x, y] of pixelsIn(rect, shot.width, shot.height))
            worst = Math.min(worst, contrast(piece.color, shot.at(x, y)));
        return { name: piece.name, minimum: piece.minimum, worst: Math.round(worst * 100) / 100 };
      });
      console.log(`${scheme} ${width}px`, JSON.stringify(results));
      for (const result of results)
        expect(result.worst, `${result.name}: ${result.worst}:1`).toBeGreaterThanOrEqual(
          result.minimum,
        );
    });

    test(`the photo shows clearly, in ${scheme} mode at ${width} pixels`, async ({
      page,
      browserName,
    }) => {
      test.skip(browserName !== "chromium", "Pixels are read in Chromium only.");
      await openHome(page, scheme, width);
      await hideText(page);
      const box = await page.evaluate(() => {
        const rect = document.querySelector("h1")!.closest("section")!.getBoundingClientRect();
        return {
          rect: {
            x: rect.x + scrollX,
            y: rect.y + scrollY,
            width: rect.width,
            height: rect.height,
          },
          canvas: getComputedStyle(document.body).backgroundColor,
        };
      });
      const canvas = parseRgb(box.canvas);
      const drawn = await shoot(page);
      // The bare photo: everything in the hero but the photo hidden, overlays included, and no
      // dimming.
      await page.addStyleTag({
        content: `section:has(> div > h1) > :not(picture, img) { visibility: hidden !important; }
          section:has(> div > h1) img { filter: none !important; }`,
      });
      const bare = await shoot(page);
      // How far each pixel is from a blank page, drawn as it is, against the bare photo: the share
      // of the photo that shows through.
      let shown = 0;
      let full = 0;
      for (const [x, y] of pixelsIn(box.rect, drawn.width, drawn.height)) {
        const a = drawn.at(x, y);
        const b = bare.at(x, y);
        for (let c = 0; c < 3; c++) {
          shown += Math.abs(a[c] - canvas[c]);
          full += Math.abs(b[c] - canvas[c]);
        }
      }
      const share = Math.round((shown / full) * 100) / 100;
      console.log(`${scheme} ${width}px photo shows`, share);
      expect(share).toBeGreaterThanOrEqual(0.6);
    });
  }
}
