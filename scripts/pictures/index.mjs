// Finds or makes the pictures for every image of the blog (scripts/pictures/make.mjs), and writes
// manifest.json: for each image, by its path in the project, what the page offers.
// src/lib/pictures.ts reads that manifest when pages are built.
//
// Two folders hold made pictures:
// - picture-cache/, committed to the repository: the full-effort pictures of every image, made with
//   "pnpm run pictures". A build (and a deploy) only reads them.
// - node_modules/.cache/dilettante-pictures/, never committed: the manifest, and quick pictures made
//   during a build for an image picture-cache/ does not hold yet (for example one added through
//   Keystatic on the live site). Deleting it only costs time.
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { availableParallelism } from "node:os";
import { join, relative } from "node:path";
import { Worker } from "node:worker_threads";
import { cachedPicture, offeredFiles } from "./make.mjs";

/** @typedef {import("./make.mjs").PictureRecord} PictureRecord */

/** The committed folder of full pictures. */
export const committedDirOf = (root) => join(root, "picture-cache");
/** The local folder of the manifest and quick pictures. */
export const cacheDirOf = (root) => join(root, "node_modules", ".cache", "dilettante-pictures");
export const manifestOf = (root) => join(cacheDirOf(root), "manifest.json");

/** Where a made file is: picture-cache/ if it holds it, otherwise the local cache. */
export const pictureFileOf = (root, name) => {
  const committed = join(committedDirOf(root), "files", name);
  return existsSync(committed) ? committed : join(cacheDirOf(root), "files", name);
};

const IMAGE = /\.(jpe?g|png|webp)$/i;
const pathOf = (root, file) => relative(root, file).split("\\").join("/");

/** Every image the blog can show: the posts' pictures and the ones in src/assets. */
export const findImages = (root) => {
  const found = [];
  const walk = (dir) => {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (IMAGE.test(entry.name)) found.push(path);
    }
  };
  walk(join(root, "src", "content", "blog"));
  walk(join(root, "src", "assets"));
  return found.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
};

const readManifest = (root) =>
  existsSync(manifestOf(root)) ? JSON.parse(readFileSync(manifestOf(root), "utf8")) : {};

const writeManifest = (root, manifest) => {
  mkdirSync(cacheDirOf(root), { recursive: true });
  writeFileSync(manifestOf(root), JSON.stringify(manifest));
};

// About how much memory one worker may need for the largest pictures (the JPEG XL encoder's
// WebAssembly memory only grows). Fewer workers run when the machine (or container) has less.
const MEMORY_PER_WORKER = 700 * 1024 * 1024;

const workerCount = (jobs) => {
  const memory = process.constrainedMemory?.() || 0;
  const byMemory = memory > 0 ? Math.floor(memory / MEMORY_PER_WORKER) - 1 : Infinity;
  return Math.max(1, Math.min(jobs, availableParallelism() - 1, 6, byMemory));
};

/**
 * Makes the pictures for the given images in worker threads, several at a time, into cacheDir.
 * "done" is called after each image with its record and the seconds it took.
 *
 * @returns {Promise<Record<string, PictureRecord>>}
 */
async function makeAll({ root, files, cacheDir, quick, done }) {
  const workers = Array.from(
    { length: workerCount(files.length) },
    () => new Worker(new URL("./worker.mjs", import.meta.url)),
  );
  /** @type {Record<string, PictureRecord>} */
  const records = {};
  try {
    const queue = [...files];
    await Promise.all(
      workers.map(async (worker) => {
        for (let file = queue.shift(); file; file = queue.shift()) {
          const started = Date.now();
          const answer = await new Promise((resolve) => {
            worker.once("message", resolve);
            worker.postMessage({ id: file, file, root, cacheDir, quick });
          });
          if (answer.error)
            throw new Error(`Could not make the pictures for ${file}:\n${answer.error}`);
          records[pathOf(root, file)] = answer.record;
          done?.(answer.record, (Date.now() - started) / 1000);
        }
      }),
    );
  } finally {
    await Promise.all(workers.map((worker) => worker.terminate()));
  }
  return records;
}

/**
 * Gets the pictures for the given images (all of them by default) ready for a build, and records
 * them in the manifest. Each image's full pictures come from picture-cache/; an image it does not
 * hold is made quickly into the local cache, with one line in the log. With "replace", images not
 * in the list are dropped from the manifest (a full build); otherwise the others are kept (the dev
 * server adding one new image).
 *
 * @returns {Promise<Record<string, PictureRecord>>}
 */
export async function preparePictures({ root, files = findImages(root), logger, replace = true }) {
  const started = Date.now();
  /** @type {Record<string, PictureRecord>} */
  const records = {};
  const missing = [];
  for (const file of files) {
    const record = cachedPicture({ file, root, cacheDir: committedDirOf(root) });
    if (record) records[pathOf(root, file)] = record;
    else missing.push(file);
  }
  if (missing.length > 0) {
    Object.assign(
      records,
      await makeAll({
        root,
        files: missing,
        cacheDir: cacheDirOf(root),
        quick: true,
        done: (record, seconds) =>
          logger?.info(
            `${record.source}: not in picture-cache/, made quickly in ${seconds.toFixed(1)}s (run "pnpm run pictures" and commit to keep it)`,
          ),
      }),
    );
  }
  writeManifest(root, { ...(replace ? {} : readManifest(root)), ...records });
  logger?.info(
    `${files.length - missing.length} pictures from picture-cache/, ${missing.length} made quickly, in ${((Date.now() - started) / 1000).toFixed(1)}s`,
  );
  return records;
}

/**
 * Makes the full pictures of every image into picture-cache/ (only those it does not hold yet),
 * then deletes the files and records of images that are gone. "pnpm run pictures" runs this.
 *
 * @returns {Promise<Record<string, PictureRecord>>}
 */
export async function regeneratePictures({ root, logger }) {
  const dir = committedDirOf(root);
  const files = findImages(root);
  const started = Date.now();
  const records = await makeAll({
    root,
    files,
    cacheDir: dir,
    quick: false,
    done: (record, seconds) => logger?.info(`${record.source}: ready in ${seconds.toFixed(1)}s`),
  });

  // File names carry their image's key, so a record whose files are not kept is an old one.
  const keep = new Set(Object.values(records).flatMap(offeredFiles));
  const listOf = (sub) => (existsSync(join(dir, sub)) ? readdirSync(join(dir, sub)) : []);
  let removed = 0;
  for (const name of listOf("records")) {
    const saved = JSON.parse(readFileSync(join(dir, "records", name), "utf8"));
    if (!offeredFiles(saved).every((file) => keep.has(file))) {
      rmSync(join(dir, "records", name));
      removed++;
    }
  }
  for (const name of listOf("files")) {
    if (!keep.has(name)) {
      rmSync(join(dir, "files", name));
      removed++;
    }
  }
  logger?.info(
    `${files.length} pictures in picture-cache/, ${removed} old files removed, in ${((Date.now() - started) / 1000).toFixed(1)}s`,
  );
  return records;
}
