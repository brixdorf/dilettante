import { defineConfig } from "astro/config";
import mdx from "@astrojs/mdx";
import tailwindcss from "@tailwindcss/vite";

import react from "@astrojs/react";
import node from "@astrojs/node";
import keystatic from "@keystatic/astro";
import taxonomySync from "./scripts/taxonomy-sync-integration.mjs";
import { siteConfig } from "./src/config/site.ts";

const site = siteConfig.siteUrl;

export default defineConfig({
  site,
  // Every page's address ends in a slash, and every link uses that form. Astro's own
  // trailingSlash: "always" would also redirect Keystatic's admin and API, which break without
  // their exact addresses, so it stays at the default ("ignore") and server.mjs redirects old page
  // addresses (301) instead.

  // The blog runs behind a reverse proxy. This lets Astro trust the proxy's X-Forwarded-* headers
  // for this address only, so pages and the Keystatic GitHub login see the real public address.
  security: {
    allowedDomains: [
      { protocol: new URL(site).protocol.slice(0, -1), hostname: new URL(site).hostname },
    ],
  },

  integrations: [mdx(), react(), keystatic(), taxonomySync()],

  markdown: {
    shikiConfig: {
      themes: { light: "github-light", dark: "github-dark-default" },
    },
  },

  vite: {
    plugins: [tailwindcss()],
    build: {
      // The Keystatic admin is one large script (about 2.7 MB) that loads only on /keystatic.
      // Every page visitors see ships far less, so Vite warns only above this size.
      chunkSizeWarningLimit: 3000,
    },
  },

  adapter: node({
    mode: "standalone",
  }),
});
