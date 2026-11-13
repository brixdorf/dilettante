// Shared helpers for the browser tests.
import { readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";
import type { Page } from "@playwright/test";

export const LIVE_ORIGIN = "https://blog.romitraj.dev";
export const ANALYTICS_ORIGIN = "https://analytics.romitraj.dev";
export const COMMENTS_ORIGIN = "https://comments.romitraj.dev";

const clientDir = join(import.meta.dirname, "..", "..", "dist", "client");

const walk = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? walk(join(dir, entry.name)) : [join(dir, entry.name)],
  );

/** Every page the build wrote, as the address a visitor types (404.html excluded). */
export const builtPages = () =>
  walk(clientDir)
    .filter((file) => file.endsWith(".html") && !file.endsWith(`${sep}404.html`))
    .map((file) => {
      const path = relative(clientDir, file).split(sep).join("/");
      return `/${path.replace(/(^|\/)index\.html$/, "")}`;
    })
    .sort();

/** Addresses of the five posts, as the build wrote them. */
export const builtPosts = () =>
  builtPages().filter((path) => /^\/blog\/[^/]+\/?$/.test(path) && path !== "/blog/");

/**
 * Records every request the page makes to the analytics or comments servers, and answers it with
 * an empty script so nothing real is contacted.
 */
export const watchThirdParties = async (page: Page) => {
  const requests: string[] = [];
  for (const origin of [ANALYTICS_ORIGIN, COMMENTS_ORIGIN]) {
    await page.route(`${origin}/**`, (route) => {
      requests.push(route.request().url());
      return route.fulfill({ status: 200, contentType: "text/javascript", body: "" });
    });
  }
  return requests;
};

/**
 * Makes the page believe it is on the live site: every request to blog.romitraj.dev is answered by
 * the local test server instead.
 */
export const pretendToBeLive = async (page: Page, localOrigin: string) => {
  await page.route(`${LIVE_ORIGIN}/**`, async (route) => {
    const url = new URL(route.request().url());
    const response = await route.fetch({ url: `${localOrigin}${url.pathname}${url.search}` });
    return route.fulfill({ response });
  });
};
