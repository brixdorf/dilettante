// Every image of the blog must have its pictures committed in picture-cache/, so a deploy only
// copies them. An image without them is made during every deploy, quickly but at lower effort.
// To fix a failure here: run "pnpm run pictures", then commit picture-cache/.
import { join, relative } from "node:path";
import { describe, expect, it } from "vite-plus/test";
import { committedDirOf, findImages } from "../../scripts/pictures/index.mjs";
import { cachedPicture } from "../../scripts/pictures/make.mjs";

const root = join(import.meta.dirname, "..", "..");

describe("picture-cache/", () => {
  it("holds the pictures of every image in the repository", () => {
    const missing = findImages(root)
      .filter((file) => !cachedPicture({ file, root, cacheDir: committedDirOf(root) }))
      .map((file) => relative(root, file));
    expect(missing, 'Run "pnpm run pictures", then commit picture-cache/.').toEqual([]);
  });
});
