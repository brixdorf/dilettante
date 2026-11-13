// One worker thread of scripts/pictures/index.mjs: makes the pictures it is handed, one at a time.
import { parentPort } from "node:worker_threads";
import { makePicture } from "./make.mjs";

parentPort.on("message", async ({ id, file, root, cacheDir, quick }) => {
  try {
    parentPort.postMessage({ id, record: await makePicture({ file, root, cacheDir, quick }) });
  } catch (error) {
    parentPort.postMessage({ id, error: error instanceof Error ? error.stack : String(error) });
  }
});
