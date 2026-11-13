// Tests the picture maker: it saves every image of the blog as JPEG XL, AVIF and its original
// format at the same visual quality (photos) or without any loss (PNG screenshots, logos and
// drawings), and offers the newer formats smallest first, ending in the original format. Made
// pictures are kept in picture-cache/ in the repository, so a build only copies them; an image
// missing there is made quickly during the build.
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vite-plus/test";
import {
  committedDirOf,
  pictureFileOf,
  preparePictures,
  regeneratePictures,
} from "../../scripts/pictures/index.mjs";
import {
  PHOTO_TARGET,
  cachedPicture,
  makePicture,
  widthsFor,
} from "../../scripts/pictures/make.mjs";
import { lowestQuality, samePixels, ssim } from "../../scripts/pictures/score.mjs";

let dir: string;

// A photo-like picture: smooth light with fine grain.
const photo = async (file: string, format: "jpeg" | "webp") => {
  const width = 720;
  const height = 480;
  const pixels = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const grain = ((x * 7919 + y * 104729) % 23) - 11;
      const at = (y * width + x) * 3;
      pixels[at] = Math.max(0, Math.min(255, 40 + (x / width) * 180 + grain));
      pixels[at + 1] = Math.max(0, Math.min(255, 90 + (y / height) * 120 + grain));
      pixels[at + 2] = Math.max(0, Math.min(255, 160 - (x / width) * 60 + grain));
    }
  }
  const image = sharp(pixels, { raw: { width, height, channels: 3 } });
  await (format === "jpeg" ? image.jpeg({ quality: 95 }) : image.webp({ quality: 95 })).toFile(
    file,
  );
};

// A screenshot-like picture: flat colours, sharp edges and a see-through corner.
const screenshot = async (file: string) => {
  const width = 600;
  const height = 400;
  const pixels = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const at = (y * width + x) * 4;
      const bar = y < 40;
      const text = y > 80 && y % 20 < 3 && x > 40 && x < 40 + ((y * 13) % 400);
      pixels.set(bar ? [42, 99, 128, 255] : text ? [20, 20, 20, 255] : [250, 250, 250, 255], at);
      if (x < 30 && y < 30) pixels.set([0, 0, 0, 0], at);
    }
  }
  await sharp(pixels, { raw: { width, height, channels: 4 } })
    .png()
    .toFile(file);
};

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "dilettante-pictures-"));
  await photo(join(dir, "photo.jpg"), "jpeg");
  await photo(join(dir, "scene.webp"), "webp");
  await screenshot(join(dir, "screen.png"));
});

afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("the score", () => {
  it("is 1 for identical pictures and less for different ones", () => {
    const a = Uint8Array.from({ length: 64 * 64 }, (_, i) => (i * 37) % 256);
    const b = a.map((value, i) => (i % 3 ? value : 255 - value));
    expect(ssim(a, a, 64, 64)).toBeCloseTo(1, 10);
    expect(ssim(a, b, 64, 64)).toBeLessThan(0.9);
  });

  it("ignores the colour of fully see-through pixels when comparing exactly", () => {
    const a = Uint8Array.from([10, 20, 30, 255, 1, 2, 3, 0]);
    expect(samePixels(a, Uint8Array.from([10, 20, 30, 255, 9, 9, 9, 0]))).toBe(true);
    expect(samePixels(a, Uint8Array.from([10, 20, 31, 255, 1, 2, 3, 0]))).toBe(false);
    expect(samePixels(a, Uint8Array.from([10, 20, 30, 254, 1, 2, 3, 0]))).toBe(false);
  });

  it("finds the lowest quality that reaches the target", async () => {
    expect(await lowestQuality(async (quality: number) => quality / 100, 0.42)).toBe(42);
    expect(await lowestQuality(async () => 0, 0.5)).toBe(100);
  });
});

describe("the widths", () => {
  it("are the usual steps below the picture's own width, then its own width", () => {
    expect(widthsFor(700)).toEqual([320, 480, 640, 700]);
    expect(widthsFor(5000)).toEqual([320, 480, 640, 960, 1280, 1600, 1920, 2600]);
    expect(widthsFor(200)).toEqual([200]);
  });
});

describe("a photo", { timeout: 60_000 }, () => {
  it("is saved in every format at the same visual quality, smallest first, JPEG last", async () => {
    const record = await makePicture({ file: join(dir, "photo.jpg"), root: dir, cacheDir: dir });
    expect(record.kind).toBe("photo");
    expect(record.width).toBe(720);
    expect(record.height).toBe(480);
    expect(record.formats.map((format) => format.type).sort()).toEqual([
      "image/avif",
      "image/jpeg",
      "image/jxl",
    ]);
    for (const format of record.formats) {
      expect(format.score).toBeGreaterThanOrEqual(PHOTO_TARGET);
      expect(format.files.map((file) => file.width)).toEqual([320, 480, 640, 720]);
      for (const file of format.files) expect(existsSync(join(dir, "files", file.name))).toBe(true);
    }
    const bytes = (type: string) => record.formats.find((format) => format.type === type)!.bytes;
    expect(record.sources.map((source) => source.type)).toEqual(
      ["image/jxl", "image/avif"].sort((a, b) => bytes(a) - bytes(b)),
    );
    expect(record.fallback.type).toBe("image/jpeg");
    expect(record.fallback.src).toMatch(/^\/_pictures\/photo-[0-9a-f]{8}-720\.jpg$/);
    expect(record.fallback.srcset).toContain("320w");
  });

  it("ends in its own format when that is not JPEG", async () => {
    const record = await makePicture({ file: join(dir, "scene.webp"), root: dir, cacheDir: dir });
    expect(record.fallback.type).toBe("image/webp");
  });

  it("is made once and then read back from the cache", async () => {
    const first = await makePicture({ file: join(dir, "photo.jpg"), root: dir, cacheDir: dir });
    const started = performance.now();
    const again = await makePicture({ file: join(dir, "photo.jpg"), root: dir, cacheDir: dir });
    expect(performance.now() - started).toBeLessThan(200);
    expect(again).toEqual(first);
  });
});

describe("a PNG", { timeout: 60_000 }, () => {
  it("is saved without loss, and only exact formats smaller than the PNG are offered", async () => {
    const record = await makePicture({ file: join(dir, "screen.png"), root: dir, cacheDir: dir });
    expect(record.kind).toBe("lossless");
    expect(record.fallback.type).toBe("image/png");
    const png = record.formats.find((format) => format.type === "image/png")!;
    for (const source of record.sources) {
      const format = record.formats.find((item) => item.type === source.type)!;
      expect(format.exact).toBe(true);
      expect(format.bytes).toBeLessThan(png.bytes);
    }
    const largest = png.files.at(-1)!;
    const decoded = await sharp(readFileSync(join(dir, "files", largest.name)))
      .ensureAlpha()
      .raw()
      .toBuffer();
    const original = await sharp(join(dir, "screen.png")).ensureAlpha().raw().toBuffer();
    expect(samePixels(decoded, original)).toBe(true);
  });
});

describe("the files kept", { timeout: 60_000 }, () => {
  it("are only those of the formats the page offers", async () => {
    const record = await makePicture({ file: join(dir, "screen.png"), root: dir, cacheDir: dir });
    const offered = new Set([record.fallback.type, ...record.sources.map((source) => source.type)]);
    for (const format of record.formats) {
      for (const file of format.files)
        expect(existsSync(join(dir, "files", file.name))).toBe(offered.has(format.type));
    }
  });
});

describe("a quick picture", { timeout: 60_000 }, () => {
  it("still reaches the same score, and is never taken for a full one", async () => {
    const cacheDir = join(dir, "quick");
    const file = join(dir, "photo.jpg");
    const quick = await makePicture({ file, root: dir, cacheDir, quick: true });
    expect(quick.quick).toBe(true);
    for (const format of quick.formats) expect(format.score).toBeGreaterThanOrEqual(PHOTO_TARGET);
    expect(cachedPicture({ file, root: dir, cacheDir })).toBeUndefined();
    const full = await makePicture({ file, root: dir, cacheDir });
    expect(full.quick).toBeUndefined();
    expect(cachedPicture({ file, root: dir, cacheDir })).toEqual(full);
  });
});

describe("a build", { timeout: 120_000 }, () => {
  let root: string;
  const lines: string[] = [];
  const logger = {
    info: (line: string) => lines.push(line),
    warn: (line: string) => lines.push(line),
  };
  const listCommitted = () => readdirSync(join(committedDirOf(root), "files")).sort();

  beforeAll(async () => {
    root = join(dir, "site");
    mkdirSync(join(root, "src", "assets"), { recursive: true });
    copyFileSync(join(dir, "photo.jpg"), join(root, "src", "assets", "photo.jpg"));
    await regeneratePictures({ root, logger });
  }, 120_000);

  it("uses the committed pictures, and quickly makes only the missing ones, one line each", async () => {
    const committed = listCommitted();
    mkdirSync(join(root, "src", "content", "blog", "post"), { recursive: true });
    copyFileSync(
      join(dir, "screen.png"),
      join(root, "src", "content", "blog", "post", "screen.png"),
    );
    lines.length = 0;
    const records = await preparePictures({ root, logger });
    expect(records["src/assets/photo.jpg"].quick).toBeUndefined();
    expect(records["src/content/blog/post/screen.png"].quick).toBe(true);
    expect(lines.filter((line) => line.includes("src/content/blog/post/screen.png"))).toHaveLength(
      1,
    );
    expect(lines.some((line) => line.includes("photo.jpg"))).toBe(false);
    expect(listCommitted()).toEqual(committed);
    for (const record of Object.values(records))
      expect(existsSync(pictureFileOf(root, record.fallback.src.split("/").at(-1)!))).toBe(true);
  });

  it("regenerating commits every image, and drops the files of images that are gone", async () => {
    rmSync(join(root, "src", "assets", "photo.jpg"));
    await regeneratePictures({ root, logger });
    const file = join(root, "src", "content", "blog", "post", "screen.png");
    expect(cachedPicture({ file, root, cacheDir: committedDirOf(root) })).toBeDefined();
    expect(listCommitted().every((name) => name.startsWith("screen-"))).toBe(true);
    expect(readdirSync(join(committedDirOf(root), "records"))).toHaveLength(1);
  });
});
