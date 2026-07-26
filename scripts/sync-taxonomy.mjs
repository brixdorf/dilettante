import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { load } from "js-yaml";

const BLOG_DIR = "src/content/blog";
const THEME_CONFIG = "src/config/theme.config.ts";
const ENTRY_FILENAME = "index.mdx";

const FRONTMATTER = /^---(?:\r?\n([\s\S]*?))?\r?\n---(?:\r?\n|$)/;

export const displayNameFor = (slug) =>
  slug
    .split(/[-_]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ") || slug;

const findPostFiles = (blogDir) => {
  const found = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.name === ENTRY_FILENAME) found.push(path);
    }
  };
  if (existsSync(blogDir)) walk(blogDir);
  return found.sort();
};

const collectUsedTaxonomy = (blogDir, logger) => {
  const categories = new Set();
  const tags = new Set();

  for (const file of findPostFiles(blogDir)) {
    const match = FRONTMATTER.exec(readFileSync(file, "utf8"));
    if (!match) continue;

    let data;
    try {
      data = load(match[1] ?? "") ?? {};
    } catch (error) {
      logger?.warn(`skipping sync: could not parse frontmatter of ${file} (${error.message})`);
      return null;
    }

    if (typeof data.category === "string" && data.category.trim()) {
      categories.add(data.category.trim());
    }
    if (Array.isArray(data.tags)) {
      for (const tag of data.tags) {
        if (typeof tag === "string" && tag.trim()) tags.add(tag.trim());
      }
    }
  }

  return { categories, tags };
};

const skipString = (source, index) => {
  const quote = source[index];
  let i = index + 1;
  while (i < source.length) {
    if (source[i] === "\\") i += 2;
    else if (source[i] === quote) return i + 1;
    else i += 1;
  }
  return source.length;
};

const scanArrayLiteral = (source, openIndex) => {
  const commas = [];
  let depth = 0;
  let i = openIndex;

  while (i < source.length) {
    const char = source[i];
    const next = source[i + 1];

    if (char === "/" && next === "/") {
      const end = source.indexOf("\n", i);
      i = end === -1 ? source.length : end;
      continue;
    }
    if (char === "/" && next === "*") {
      const end = source.indexOf("*/", i + 2);
      i = end === -1 ? source.length : end + 2;
      continue;
    }
    if (char === '"' || char === "'" || char === "`") {
      i = skipString(source, i);
      continue;
    }
    if (char === "[" || char === "{" || char === "(") {
      depth += 1;
    } else if (char === "]" || char === "}" || char === ")") {
      depth -= 1;
      if (depth === 0) return { closeIndex: i, commas };
    } else if (char === "," && depth === 1) {
      commas.push(i);
    }
    i += 1;
  }

  return null;
};

const readArrayExport = (source, name) => {
  const opener = new RegExp(`export\\s+const\\s+${name}\\s*(?::[^=]*)?=\\s*\\[`).exec(source);
  if (!opener) return null;

  const openIndex = opener.index + opener[0].length - 1;
  const scanned = scanArrayLiteral(source, openIndex);
  if (!scanned) return null;

  const bodyStart = openIndex + 1;
  const body = source.slice(bodyStart, scanned.closeIndex);
  const boundaries = [...scanned.commas.map((c) => c - bodyStart), body.length];

  const entries = [];
  let cursor = 0;
  for (const boundary of boundaries) {
    const code = body.slice(cursor, boundary).trim();
    cursor = boundary + 1;

    let comment = "";
    if (boundary < body.length) {
      const trailing = /^[^\S\n]*(\/\/[^\n]*)/.exec(body.slice(cursor));
      if (trailing) {
        comment = trailing[1].trim();
        cursor += trailing[0].length;
      }
    }

    if (!code) continue;
    const slug = /\bslug\s*:\s*(["'`])([^"'`]*)\1/.exec(code);
    entries.push({
      code,
      comment,
      slug: slug ? slug[2] : null,
    });
  }

  return { openIndex, closeIndex: scanned.closeIndex, entries };
};

const renderEntry = (entry) => `  ${entry.code},${entry.comment ? ` ${entry.comment}` : ""}`;

const renderArray = (entries) =>
  entries.length === 0 ? "[]" : `[\n${entries.map(renderEntry).join("\n")}\n]`;

const reconcile = (existing, used) => {
  const kept = existing.filter((entry) => {
    if (entry.slug === null) return true;

    return used.has(entry.slug);
  });

  const present = new Set(kept.map((entry) => entry.slug).filter(Boolean));
  const added = [...used]
    .filter((slug) => !present.has(slug))
    .sort()
    .map((slug) => ({
      code: `{ slug: ${JSON.stringify(slug)}, name: ${JSON.stringify(displayNameFor(slug))} }`,
      comment: "",
      slug,
    }));

  return {
    entries: [...kept, ...added],
    added,
    removed: existing.filter((e) => !kept.includes(e)),
  };
};

/**
 * @returns {{ changed: boolean, added: {categories: string[], tags: string[]},
 *             removed: {categories: string[], tags: string[]} } | null}
 *          `null` when the sync was skipped (unreadable post, unreadable theme config).
 */

export function syncTaxonomy({ root = process.cwd(), logger = console, dryRun = false } = {}) {
  const themePath = join(root, THEME_CONFIG);
  if (!existsSync(themePath)) {
    logger?.warn(`skipping sync: ${THEME_CONFIG} not found`);
    return null;
  }

  const used = collectUsedTaxonomy(join(root, BLOG_DIR), logger);
  if (!used) return null;

  const source = readFileSync(themePath, "utf8");
  const targets = [
    { name: "categories", used: used.categories },
    { name: "tags", used: used.tags },
  ];

  let next = source;
  const added = { categories: [], tags: [] };
  const removed = { categories: [], tags: [] };

  for (const target of [...targets].reverse()) {
    const parsed = readArrayExport(next, target.name);
    if (!parsed) {
      logger?.warn(`skipping sync: could not locate "export const ${target.name} = [...]"`);
      return null;
    }

    const result = reconcile(parsed.entries, target.used);
    const before = parsed.entries.map((e) => e.slug);
    const after = result.entries.map((e) => e.slug);
    if (before.length === after.length && before.every((slug, i) => slug === after[i])) continue;

    added[target.name] = result.added.map((e) => e.slug);
    removed[target.name] = result.removed.map((e) => e.slug).filter(Boolean);
    next =
      next.slice(0, parsed.openIndex) +
      renderArray(result.entries) +
      next.slice(parsed.closeIndex + 1);
  }

  const changed = next !== source;
  if (changed && !dryRun) writeFileSync(themePath, next, "utf8");

  return { changed, added, removed };
}

export const describeSync = (result) => {
  const parts = [];
  for (const kind of ["categories", "tags"]) {
    for (const slug of result.added[kind]) parts.push(`+${kind === "tags" ? "#" : ""}${slug}`);
    for (const slug of result.removed[kind]) parts.push(`-${kind === "tags" ? "#" : ""}${slug}`);
  }
  return parts.join(" ");
};

if (import.meta.filename === process.argv[1]) {
  const result = syncTaxonomy({ dryRun: process.argv.includes("--dry-run") });
  if (!result) process.exitCode = 1;
  else if (result.changed) console.log(`${relative(".", THEME_CONFIG)}: ${describeSync(result)}`);
  else console.log(`${relative(".", THEME_CONFIG)}: already in sync`);
}
