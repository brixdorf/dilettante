import { defineConfig } from "astro/config";
import mdx from "@astrojs/mdx";
import tailwindcss from "@tailwindcss/vite";

const site =
  process.env.SITE_URL || process.env.PUBLIC_SITE_URL || "https://blog.romitraj.dev";

export default defineConfig({
  site,
  integrations: [mdx()],
  vite: {
    plugins: [tailwindcss()],
  },
});
