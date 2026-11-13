// "pnpm run pictures": makes the full pictures of every image of the blog into picture-cache/
// (only the ones it does not hold yet) and removes those of images that are gone. Commit
// picture-cache/ afterwards, so deploys only copy them.
import { fileURLToPath } from "node:url";
import { regeneratePictures } from "./index.mjs";

const root = fileURLToPath(new URL("../..", import.meta.url));
await regeneratePictures({ root, logger: { info: console.log, warn: console.warn } });
