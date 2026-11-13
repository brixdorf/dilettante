// Draws the pictures that show when the blog is shared, in the blog's own fonts, colours and home
// page photo, with the home page's headline:
// - public/og-image.png, 1200 by 630: the share image of every page without its own picture
//   (home, archive, About, Contact). Posts share their own cover.
// - the GitHub social preview, 1280 by 640, a PNG under 1 MB, uploaded by hand in the repository's
//   Settings, Social preview. Saved to ../github-social-preview.png, or the path given.
// - preview.webp, the screenshot at the top of the README, taken from the built blog.
//
// Run it after "pnpm build", in the Playwright toolbox on Fedora:
//   pnpm run share [path for the GitHub preview]
import { spawn } from "node:child_process";
import { readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import sharp from "sharp";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const githubPreview = resolve(process.argv[2] ?? join(root, "..", "github-social-preview.png"));
const homeConfig = readFileSync(join(root, "src", "config", "home.ts"), "utf8");
const siteConfig = readFileSync(join(root, "src", "config", "site.ts"), "utf8");
const headline = /title:\s*"([^"]+)"/.exec(homeConfig)[1];
const name = /name:\s*"([^"]+)"/.exec(siteConfig)[1];
const address = new URL(/siteUrl:\s*"([^"]+)"/.exec(siteConfig)[1]).host;

// Fonts and the photo go into the page itself, which cannot load local files.
const file = (path) => {
  const type = path.endsWith(".woff2") ? "font/woff2" : "image/jpeg";
  return `data:${type};base64,${readFileSync(join(root, path)).toString("base64")}`;
};
const escape = (text) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
// Words wrapped in *asterisks* are set in italic, as on the home page.
const headlineHtml = escape(headline).replace(/\*([^*]+)\*/g, "<em>$1</em>");

const card = ({ width, height }) => `<!doctype html>
<html><head><meta charset="utf-8"><style>
  @font-face { font-family: "Newsreader"; src: url("${file("public/fonts/newsreader/newsreader-latin.woff2")}"); font-weight: 200 800; }
  @font-face { font-family: "Newsreader"; src: url("${file("public/fonts/newsreader/newsreader-latin-italic.woff2")}"); font-weight: 200 800; font-style: italic; }
  @font-face { font-family: "Geist"; src: url("${file("public/fonts/geist/Geist-Variable.woff2")}"); font-weight: 100 900; }
  * { margin: 0; box-sizing: border-box; }
  html, body { width: ${width}px; height: ${height}px; overflow: hidden; }
  body { position: relative; background: #fbfdfe; color: #0b1f2c; font-family: "Geist", sans-serif; }
  .photo { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; object-position: bottom; }
  .shade { position: absolute; inset: 0; background: linear-gradient(to bottom, #fbfdfe 0%,
    color-mix(in oklab, #fbfdfe 92%, transparent) 42%, color-mix(in oklab, #fbfdfe 62%, transparent) 60%, transparent 82%); }
  .content { position: relative; height: 100%; display: flex; flex-direction: column; align-items: center; padding: ${height * 0.09}px ${width * 0.07}px; text-align: center; }
  .name { font-family: "Newsreader", serif; font-size: ${height * 0.05}px; font-weight: 500; letter-spacing: -0.01em; }
  h1 { margin-top: ${height * 0.07}px; font-family: "Newsreader", serif; font-weight: 300; font-size: ${height * 0.105}px; line-height: 1.04; letter-spacing: -0.02em; max-width: 15em; }
  em { font-style: italic; }
  .address { position: absolute; bottom: ${height * 0.07}px; left: 0; right: 0; text-align: center; font-size: ${height * 0.032}px; color: #fbfdfe; letter-spacing: 0.02em; }
</style></head><body>
  <img class="photo" src="${file("src/assets/hero-mist.jpg")}" alt="">
  <div class="shade"></div>
  <div class="content">
    <div class="name">${escape(name)}</div>
    <h1>${headlineHtml}</h1>
  </div>
  <div class="address">${escape(address)}</div>
</body></html>`;

const browser = await chromium.launch();
try {
  const cards = [
    { size: { width: 1200, height: 630 }, out: join(root, "public", "og-image.png") },
    { size: { width: 1280, height: 640 }, out: githubPreview },
  ];
  for (const { size, out } of cards) {
    const page = await browser.newPage({ viewport: size });
    await page.setContent(card(size), { waitUntil: "load" });
    await page.evaluate(() => document.fonts.ready);
    const shot = await page.screenshot({ type: "png" });
    // A palette of 256 colours keeps the file small; the photo is soft enough not to show it.
    const png = await sharp(shot)
      .png({ palette: true, quality: 90, compressionLevel: 9 })
      .toBuffer();
    writeFileSync(out, png);
    console.log(`${out}: ${size.width} by ${size.height}, ${(png.length / 1024).toFixed(0)} KB`);
    if (png.length >= 1024 * 1024) throw new Error(`${out} is 1 MB or more.`);
    await page.close();
  }

  // The README screenshot: the top of the home page, from the built blog.
  const port = 4431;
  const server = spawn(process.execPath, [join(root, "server.mjs")], {
    env: { ...process.env, HOST: "127.0.0.1", PORT: String(port) },
    stdio: "ignore",
  });
  try {
    const page = await browser.newPage({
      viewport: { width: 1920, height: 1020 },
      colorScheme: "light",
    });
    for (let tries = 0; ; tries++) {
      try {
        await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "networkidle" });
        break;
      } catch (error) {
        if (tries > 40) throw error;
        await new Promise((done) => setTimeout(done, 250));
      }
    }
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(1200);
    const webp = await sharp(await page.screenshot({ type: "png" }))
      .webp({ quality: 82 })
      .toBuffer();
    writeFileSync(join(root, "preview.webp"), webp);
    console.log(
      `preview.webp: 1920 by 1020, ${(statSync(join(root, "preview.webp")).size / 1024).toFixed(0)} KB`,
    );
  } finally {
    server.kill();
  }
} finally {
  await browser.close();
}
