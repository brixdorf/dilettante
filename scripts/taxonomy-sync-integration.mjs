import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { describeSync, syncTaxonomy } from "./sync-taxonomy.mjs";

const DEBOUNCE_MS = 200;

export default function taxonomySync() {
  return {
    name: "taxonomy-sync",
    hooks: {
      "astro:config:setup": ({ config, logger }) => {
        const result = syncTaxonomy({ root: fileURLToPath(config.root), logger });
        if (result?.changed) logger.info(`theme.config.ts updated: ${describeSync(result)}`);
      },

      "astro:server:setup": ({ server, logger }) => {
        const projectRoot = server.config.root;
        const blogDir = join(projectRoot, "src", "content", "blog");

        let timer;
        const run = () => {
          timer = undefined;
          try {
            const result = syncTaxonomy({ root: projectRoot, logger });
            if (result?.changed) logger.info(`theme.config.ts updated: ${describeSync(result)}`);
          } catch (error) {
            logger.warn(`taxonomy sync failed: ${error.message}`);
          }
        };

        const schedule = (path) => {
          const normalised = String(path).replace(/\\/g, "/");
          if (!normalised.includes("/src/content/blog/")) return;
          clearTimeout(timer);
          timer = setTimeout(run, DEBOUNCE_MS);
        };

        server.watcher.add(blogDir);
        for (const event of ["add", "change", "unlink", "addDir", "unlinkDir"]) {
          server.watcher.on(event, schedule);
        }
      },
    },
  };
}
