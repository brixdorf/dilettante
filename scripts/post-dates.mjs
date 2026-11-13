// Gives the Keystatic admin each post's published date, so its Blog posts list can open sorted by
// date (see parseSlugForSort in keystatic.config.ts). The dates are read from the posts' front
// matter when the blog is built, or when the development server starts, and the admin gets only
// a small module like: export default {"hello-there":1773619200000}. No post bodies reach it.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { load } from "js-yaml";

const BLOG_DIR = join("src", "content", "blog");
const ENTRY_FILENAME = "index.mdx";
const MODULE_ID = "virtual:post-dates";
const RESOLVED_ID = `\0${MODULE_ID}`;

const FRONTMATTER = /^---(?:\r?\n([\s\S]*?))?\r?\n---(?:\r?\n|$)/;

const toTime = (value) => {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "string") return Date.parse(value);
  return Number.NaN;
};

const readDate = (file) => {
  if (!existsSync(file)) return Number.NaN;
  const match = FRONTMATTER.exec(readFileSync(file, "utf8"));
  if (!match) return Number.NaN;
  try {
    return toTime(load(match[1] ?? "")?.date);
  } catch {
    return Number.NaN;
  }
};

// Maps each post's folder name (its slug) to its published date, in milliseconds since 1970.
// Posts without a readable date are left out, and Keystatic then lists them last.
export const readPostDates = (blogDir) => {
  if (!existsSync(blogDir)) return {};
  const dates = {};
  for (const entry of readdirSync(blogDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const time = readDate(join(blogDir, entry.name, ENTRY_FILENAME));
    if (Number.isFinite(time)) dates[entry.name] = time;
  }
  return Object.fromEntries(Object.entries(dates).sort(([a], [b]) => (a < b ? -1 : 1)));
};

export default function postDates() {
  let blogDir = BLOG_DIR;
  return {
    name: "post-dates",
    configResolved(config) {
      blogDir = join(config.root, BLOG_DIR);
    },
    resolveId(id) {
      return id === MODULE_ID ? RESOLVED_ID : undefined;
    },
    load(id) {
      if (id !== RESOLVED_ID) return undefined;
      return `export default ${JSON.stringify(readPostDates(blogDir))};`;
    },
    // During development, a post saved or deleted in Keystatic (local mode) is in the list the
    // next time the admin page loads. Nothing reloads while the admin is open.
    configureServer(server) {
      const forget = (path) => {
        if (!String(path).startsWith(blogDir)) return;
        for (const environment of Object.values(server.environments)) {
          const module = environment.moduleGraph.getModuleById(RESOLVED_ID);
          if (module) environment.moduleGraph.invalidateModule(module);
        }
      };
      for (const event of ["add", "change", "unlink"]) server.watcher.on(event, forget);
    },
  };
}
