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
  integrations: [mdx(), react(), keystatic(), taxonomySync()],

  vite: {
    plugins: [tailwindcss()],
  },

  adapter: node({
    mode: "standalone",
  }),
});
