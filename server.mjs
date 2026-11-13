// Starts the live blog: the server Astro builds (dist/server/entry.mjs), with one rule in front.
// Every page's address ends in a slash. An old address without it (/about, /blog/hello-there)
// answers with a permanent redirect (301) to the new one, so links shared before keep working.
// Only addresses of pages the build wrote are redirected; everything else, Keystatic's admin and
// API included, reaches Astro exactly as it arrived.
//
// Railpack starts this with "node ./server.mjs" (railpack.json); locally it is "pnpm start".
// It reads HOST and PORT like Astro's own server does.
import { existsSync } from "node:fs";
import http from "node:http";
import { posix } from "node:path";
import { fileURLToPath } from "node:url";

// Stop Astro's server from starting itself on import; this file starts it instead.
process.env.ASTRO_NODE_AUTOSTART = "disabled";
const { handler, options } = await import("./dist/server/entry.mjs");

const clientDir = fileURLToPath(new URL("./dist/client", import.meta.url));

/** The address to redirect to, or undefined to leave the request to Astro. */
const slashTarget = (method, url) => {
  if (method !== "GET" && method !== "HEAD") return undefined;
  const [path, query] = url.split(/\?(.*)/s);
  if (path.endsWith("/")) return undefined;
  let decoded;
  try {
    decoded = decodeURI(path);
  } catch {
    return undefined;
  }
  // Only plain paths inside the built site, never "..", backslashes or double slashes.
  if (posix.normalize(decoded) !== decoded || decoded.includes("\\")) return undefined;
  if (!existsSync(posix.join(clientDir, decoded, "index.html"))) return undefined;
  return `${path}/${query === undefined ? "" : `?${query}`}`;
};

const port = process.env.PORT ? Number(process.env.PORT) : (options.port ?? 8080);
const hostOption =
  typeof options.host === "boolean" ? (options.host ? "0.0.0.0" : "localhost") : options.host;
const host = process.env.HOST ?? hostOption;

const server = http.createServer((req, res) => {
  const target = slashTarget(req.method ?? "GET", req.url ?? "/");
  if (target) {
    res.writeHead(301, { Location: target });
    res.end();
    return;
  }
  handler(req, res);
});

server.listen(port, host, () => {
  console.log(`Blog server listening on http://${host}:${port}`);
});
