// Checks Keystatic in the built blog, the way the live site runs it (GitHub mode). Nothing here
// logs in: the GitHub login is only followed as far as the address it sends the browser to.
import { expect, test } from "@playwright/test";
import { LIVE_ORIGIN } from "./helpers";

// What the reverse proxy in front of the live blog (Traefik, in Dokploy) passes on: the visitor's
// own Host header, plus where the request really came in.
const proxyHeaders = {
  Host: new URL(LIVE_ORIGIN).host,
  "X-Forwarded-Host": new URL(LIVE_ORIGIN).host,
  "X-Forwarded-Proto": "https",
  "X-Forwarded-Port": "443",
};

test("the GitHub login sends GitHub the public address of the blog, not the local one", async ({
  request,
}) => {
  const response = await request.get("/api/keystatic/github/login", {
    headers: proxyHeaders,
    maxRedirects: 0,
  });
  expect(response.status()).toBe(307);
  const location = new URL(response.headers()["location"]);
  expect(location.origin).toBe("https://github.com");
  expect(location.searchParams.get("redirect_uri")).toBe(
    `${LIVE_ORIGIN}/api/keystatic/github/oauth/callback`,
  );
});

test("the admin page loads in the built blog", async ({ page }) => {
  const response = await page.goto("/keystatic");
  expect(response?.ok()).toBe(true);
});
