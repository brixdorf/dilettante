// Makes the pictures for every image of the blog (scripts/pictures/make.mjs), several at a time in
// worker threads, and writes manifest.json: for each image, by its path in the project, what the
// page offers. src/lib/pictures.ts reads that manifest when pages are built.
import { existsSync, readFileSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { availableParallelism } from "node:os";
import { join, relative } from "node:path";
import { Worker } from "node:worker_threads";

/** The folder that keeps made pictures between builds. Deleting it only costs time. */
export const cacheDirOf = (root) => join(root, "node_modules", ".cache", "dilettante-pictures");
export const manifestOf = (root) => join(cacheDirOf(root), "manifest.json");

const IMAGE = /\.(jpe?g|png|webp)$/i;

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

/**
 * Makes the pictures for the given images (all of them by default) and records them in the
 * manifest. With "replace", images not in the list are dropped from it (a full build); otherwise
 * the others are kept (the dev server adding one new image).
 */
export async function preparePictures({ root, files = findImages(root), logger, replace = true }) {
  const cacheDir = cacheDirOf(root);
  const threads = Math.max(1, Math.min(files.length, availableParallelism() - 1, 6));
  const started = Date.now();
  const workers = Array.from(
    { length: threads },
    () => new Worker(new URL("./worker.mjs", import.meta.url)),
  );
  const records = {};
  try {
    const queue = [...files];
    await Promise.all(
      workers.map(async (worker) => {
        for (let file = queue.shift(); file; file = queue.shift()) {
          const answer = await new Promise((resolve) => {
            worker.once("message", resolve);
            worker.postMessage({ id: file, file, root, cacheDir });
          });
          if (answer.error)
            throw new Error(`Could not make the pictures for ${file}:\n${answer.error}`);
          records[relative(root, file).split("\\").join("/")] = answer.record;
        }
      }),
    );
  } finally {
    await Promise.all(workers.map((worker) => worker.terminate()));
  }
  writeManifest(root, { ...(replace ? {} : readManifest(root)), ...records });
  logger?.info(
    `${files.length} pictures ready in ${((Date.now() - started) / 1000).toFixed(1)}s (${threads} at a time)`,
  );
  return records;
}
