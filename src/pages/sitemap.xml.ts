// The sitemap search engines read: only the home page, the archive, About, Contact, every post and
// the author page. Section, tag, Sections, Tags and Contributors pages still exist for visitors,
// but are left out of it.
import type { APIRoute } from "astro";
import { authors } from "@/config/authors";
import { siteConfig } from "@/config/site";
import { authorUrl, getPosts, isoDate, postUrl } from "@/lib/posts";

export const GET: APIRoute = async () => {
  const posts = await getPosts();
  const entries: { path: string; lastmod?: string }[] = [
    { path: "/" },
    { path: "/blog/" },
    { path: "/about/" },
    { path: "/contact/" },
    ...posts.map((post) => ({ path: postUrl(post), lastmod: isoDate(post.updated ?? post.date) })),
    ...authors.map((author) => ({ path: authorUrl(author.slug) })),
  ];

  const urls = entries.map((entry) =>
    [
      "  <url>",
      `    <loc>${new URL(entry.path, siteConfig.siteUrl)}</loc>`,
      ...(entry.lastmod ? [`    <lastmod>${entry.lastmod}</lastmod>`] : []),
      "  </url>",
    ].join("\n"),
  );

  return new Response(
    [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
      ...urls,
      "</urlset>",
      "",
    ].join("\n"),
    { headers: { "Content-Type": "application/xml; charset=utf-8" } },
  );
};
