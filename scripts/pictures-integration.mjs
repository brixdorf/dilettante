// Connects the picture maker (scripts/pictures/) to Astro:
// - Before a build, it gets the pictures of every image ready, so pages can offer them
//   (src/components/ui/Picture.astro): those committed in picture-cache/ are used as they are, and
//   only an image missing there is made, quickly, with one line in the log.
// - After the build, it copies the files the pages use into dist/client/_pictures/.
// - In the dev server, it does the same in the background (pages show plain images until they are
//   ready), makes quick ones when an image is added to a post, and serves /_pictures/.
import {
  copyFileSync,
  createReadStream,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
} from "node:fs";
import { basename, extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { findImages, pictureFileOf, preparePictures } from "./pictures/index.mjs";
import { PICTURES_URL } from "./pictures/make.mjs";

const TYPES = {
  ".jxl": "image/jxl",
  ".avif": "image/avif",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};
const IMAGE = /\.(jpe?g|png|webp)$/i;

const walk = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? walk(join(dir, entry.name)) : [join(dir, entry.name)],
  );

export default function pictures() {
  let root;
  let clientDir;

  return {
    name: "pictures",
    hooks: {
      "astro:config:done": ({ config }) => {
        root = fileURLToPath(config.root);
        clientDir = fileURLToPath(config.build.client);
      },

      "astro:build:start": async ({ logger }) => {
        await preparePictures({ root, logger });
      },

      "astro:build:done": ({ logger }) => {
        const used = new Set();
        const pattern = new RegExp(`${PICTURES_URL}([\\w.-]+)`, "g");
        for (const file of walk(clientDir).filter((path) => path.endsWith(".html"))) {
          for (const match of readFileSync(file, "utf8").matchAll(pattern)) used.add(match[1]);
        }
        const target = join(clientDir, PICTURES_URL);
        mkdirSync(target, { recursive: true });
        for (const name of used) copyFileSync(pictureFileOf(root, name), join(target, name));
        logger.info(`${used.size} picture files copied`);
      },

      "astro:server:setup": ({ server, logger }) => {
        server.middlewares.use(PICTURES_URL, (req, res, next) => {
          const name = basename(decodeURIComponent((req.url ?? "").split("?")[0]));
          const file = pictureFileOf(root, name);
          if (!name || !existsSync(file)) return next();
          res.setHeader("Content-Type", TYPES[extname(name)] ?? "application/octet-stream");
          createReadStream(file).pipe(res);
        });

        let running = Promise.resolve();
        const prepare = (files, replace) => {
          running = running
            .then(() => preparePictures({ root, files, logger, replace }))
            .catch((error) => logger.warn(error.message));
          return running;
        };
        void prepare(findImages(root), true);

        const blogDir = join(root, "src", "content", "blog");
        server.watcher.on("add", (path) => {
          const file = String(path);
          if (file.startsWith(blogDir) && IMAGE.test(file)) void prepare([file], false);
        });
      },
    },
  };
}
