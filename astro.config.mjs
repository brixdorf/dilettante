import { defineConfig } from "astro/config";
import mdx from "@astrojs/mdx";
import tailwindcss from "@tailwindcss/vite";

import react from "@astrojs/react";
import node from "@astrojs/node";
import keystatic from "@keystatic/astro";
import taxonomySync from "./scripts/taxonomy-sync-integration.mjs";

const site = process.env.SITE_URL || process.env.PUBLIC_SITE_URL || "https://blog.romitraj.dev";

export default defineConfig({
  site,

  // The blog runs behind a reverse proxy. This lets Astro trust the proxy's X-Forwarded-* headers
  // for this address only, so pages and the Keystatic GitHub login see the real public address.
  security: {
    allowedDomains: [
      { protocol: new URL(site).protocol.slice(0, -1), hostname: new URL(site).hostname },
    ],
  },
  integrations: [mdx(), react(), keystatic(), taxonomySync()],

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
