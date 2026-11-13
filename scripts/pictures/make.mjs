// Turns one image of the blog into the files a <picture> needs, at a ladder of widths, in three
// formats: JPEG XL, AVIF and the image's own format (JPEG, PNG or WebP).
//
// - A photo (JPEG or WebP) is saved in each format at the lowest quality that reaches the same
//   score (SSIM on brightness, PHOTO_TARGET), so all three look the same and only their sizes
//   differ: visually lossless.
// - A PNG (screenshots, logos, drawings) is saved without any loss in each format, and a format
//   counts only if it gives back exactly the original pixels.
//
// The page offers JPEG XL and AVIF, smallest first, but only when smaller than the file in the
// original format, which always comes last for browsers that know neither.
//
// Only the files the page offers are kept. They are kept in a cache folder, under a key made from
// the image's content and the encoder settings, so an image is only ever made once. The full ones
// are committed in picture-cache/ ("pnpm run pictures"); a "quick" one, made during a build for an
// image that has none there, uses less encoder effort (EFFORT) and is kept apart, under its own key.
// src/lib/pictures.ts reads the results; scripts/pictures/index.mjs finds or makes them for every
// image before a build and copies the files into it.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, extname, join, relative } from "node:path";
import sharp from "sharp";
import { EFFORT, encoders, originalEncoder } from "./encoders.mjs";
import { luma, lowestQuality, samePixels, ssim } from "./score.mjs";

/** The score every photo format must reach. 1 would be identical; 0.995 is hard to tell apart. */
export const PHOTO_TARGET = 0.995;

/** Where the files are served from. */
export const PICTURES_URL = "/_pictures/";

// The widths pictures are saved at, up to the widest any page shows (the home page photo).
const STEPS = [320, 480, 640, 960, 1280, 1600, 1920, 2600];
// The width the quality search runs at: the widest step up to this one.
const PROBE = 640;
// Bump when the way files are made changes, so old cached files are not reused.
const VERSION = 2;

/** The widths to save a picture at: the usual steps below its own width, then its own width. */
export const widthsFor = (sourceWidth) => {
  const widest = Math.min(sourceWidth, STEPS.at(-1));
  return [...STEPS.filter((step) => step < widest), widest];
};

const stemOf = (file) =>
  basename(file, extname(file))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "picture";

const srcset = (files) =>
  files.map((file) => `${PICTURES_URL}${file.name} ${file.width}w`).join(", ");

/** @typedef {{ name: string, width: number, bytes: number }} PictureFile */
/**
 * @typedef {{ type: string, extension: string, quality: number | "lossless", score?: number,
 *   exact?: boolean, bytes: number, files: PictureFile[] }} PictureFormat
 */
/**
 * @typedef {{ source: string, quick?: true, kind: "photo" | "lossless", width: number, height: number,
 *   formats: PictureFormat[], sources: { type: string, srcset: string }[],
 *   fallback: { type: string, src: string, srcset: string } }} PictureRecord
 */

/**
 * The cache key of an image: its content and every setting that shapes its files. Library
 * versions are left out on purpose: an update of sharp or jSquash leaves the files just as good,
 * and should not make every picture again (and change picture-cache/).
 */
const keyOf = (bytes, kind, quick) =>
  createHash("sha256")
    .update(bytes)
    .update(
      JSON.stringify({
        kind,
        PHOTO_TARGET,
        STEPS,
        PROBE,
        VERSION,
        effort: quick ? EFFORT.quick : EFFORT.full,
        ...(quick ? { quick } : {}),
      }),
    )
    .digest("hex")
    .slice(0, 16);

const kindOf = (file) => (extname(file).toLowerCase() === ".png" ? "lossless" : "photo");
const sourceOf = (root, file) => relative(root, file).split("\\").join("/");

/** The names of the files a record's page offers: every file kept for it. */
export const offeredFiles = (record) => {
  const offered = new Set([record.fallback.type, ...record.sources.map((source) => source.type)]);
  return record.formats
    .filter((format) => offered.has(format.type))
    .flatMap((format) => format.files.map((item) => item.name));
};

const readRecord = (cacheDir, key) => {
  const recordFile = join(cacheDir, "records", `${key}.json`);
  if (!existsSync(recordFile)) return undefined;
  const saved = JSON.parse(readFileSync(recordFile, "utf8"));
  const complete = offeredFiles(saved).every((name) => existsSync(join(cacheDir, "files", name)));
  return complete ? saved : undefined;
};

/**
 * The full (not quick) record of an image if the cache folder holds it with all its files, or
 * undefined. Never makes anything.
 *
 * @param {{ file: string, root: string, cacheDir: string }} options
 * @returns {PictureRecord | undefined}
 */
export function cachedPicture({ file, root, cacheDir }) {
  const saved = readRecord(cacheDir, keyOf(readFileSync(file), kindOf(file), false));
  return saved && { ...saved, source: sourceOf(root, file) };
}

/**
 * Makes (or reads back from the cache) every file for one image. Returns its record: its size,
 * every format made, and what the page offers ("sources", smallest first, then "fallback").
 * "quick" uses less encoder effort (EFFORT.quick), and the record says so.
 *
 * @param {{ file: string, root: string, cacheDir: string, quick?: boolean }} options
 * @returns {Promise<PictureRecord>}
 */
export async function makePicture({ file, root, cacheDir, quick = false }) {
  const bytes = readFileSync(file);
  const kind = kindOf(file);
  const original = originalEncoder(extname(file).slice(1));
  const effort = quick ? EFFORT.quick : EFFORT.full;
  const key = keyOf(bytes, kind, quick);
  const filesDir = join(cacheDir, "files");
  const source = sourceOf(root, file);

  const saved = readRecord(cacheDir, key);
  if (saved) return { ...saved, source };

  const image = sharp(bytes).rotate();
  const meta = await image.metadata();
  const [sourceWidth, sourceHeight] =
    (meta.orientation ?? 1) >= 5 ? [meta.height, meta.width] : [meta.width, meta.height];
  const sizes = widthsFor(sourceWidth).map((width) => ({
    width,
    height: Math.max(1, Math.round((sourceHeight * width) / sourceWidth)),
  }));
  const pixels = [];
  for (const size of sizes) {
    const rgba = await sharp(bytes)
      .rotate()
      .resize(size.width, size.height, { fit: "fill", kernel: "lanczos3" })
      .ensureAlpha()
      .raw()
      .toBuffer();
    pixels.push(new Uint8Array(rgba.buffer, rgba.byteOffset, rgba.length));
  }
  const probe = Math.max(0, sizes.filter((size) => size.width <= PROBE).length - 1);
  const stem = `${stemOf(file)}-${key.slice(0, 8)}`;

  const formats = [];
  const buffers = new Map();
  for (const encoder of [encoders.jxl, encoders.avif, original]) {
    let quality = "lossless";
    let score;
    if (kind === "photo") {
      const { width, height } = sizes[probe];
      const reference = luma(pixels[probe]);
      const tried = new Map();
      const scoreAt = async (value) => {
        if (!tried.has(value)) {
          const encoded = await encoder.encode(pixels[probe], width, height, value, effort);
          tried.set(value, ssim(reference, luma(await encoder.decode(encoded)), width, height));
        }
        return tried.get(value);
      };
      quality = await lowestQuality(scoreAt, PHOTO_TARGET);
      score = await scoreAt(quality);
    }
    const files = [];
    let exact = true;
    for (const [index, size] of sizes.entries()) {
      const buffer = await encoder.encode(pixels[index], size.width, size.height, quality, effort);
      if (kind === "lossless" && exact)
        exact = samePixels(await encoder.decode(buffer), pixels[index]);
      const name = `${stem}-${size.width}.${encoder.extension}`;
      buffers.set(name, buffer);
      files.push({ name, width: size.width, bytes: buffer.length });
    }
    formats.push({
      type: encoder.type,
      extension: encoder.extension,
      quality,
      ...(score === undefined ? {} : { score }),
      exact: kind === "lossless" ? exact : undefined,
      bytes: files.reduce((sum, item) => sum + item.bytes, 0),
      files,
    });
  }

  const fallback = formats.find((format) => format.type === original.type);
  const offered = formats
    .filter((format) => format !== fallback)
    .filter((format) => kind === "photo" || format.exact)
    .filter((format) => format.bytes < fallback.bytes)
    .sort((a, b) => a.bytes - b.bytes);
  // The plain src: the widest file up to 960 pixels, for anything that ignores srcset.
  const plain = fallback.files.filter((item) => item.width <= 960).at(-1) ?? fallback.files[0];
  const record = {
    ...(quick ? { quick } : {}),
    kind,
    width: sizes.at(-1).width,
    height: sizes.at(-1).height,
    formats,
    sources: offered.map((format) => ({ type: format.type, srcset: srcset(format.files) })),
    fallback: {
      type: fallback.type,
      src: `${PICTURES_URL}${plain.name}`,
      srcset: srcset(fallback.files),
    },
  };
  mkdirSync(filesDir, { recursive: true });
  for (const name of offeredFiles(record)) writeFileSync(join(filesDir, name), buffers.get(name));
  mkdirSync(join(cacheDir, "records"), { recursive: true });
  writeFileSync(join(cacheDir, "records", `${key}.json`), JSON.stringify(record, null, 2) + "\n");
  return { ...record, source };
}
