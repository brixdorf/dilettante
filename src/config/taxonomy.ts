// The sections (categories) and tags posts may use. scripts/sync-taxonomy.mjs keeps these two lists
// in step with the posts: it adds what a post starts using and removes what no post uses any more.
// It runs before every build, in the dev server, and in a GitHub Action after posts change.
export interface Term {
  slug: string;
  name: string;
}

export interface Category extends Term {
  /** Optional. The lead on the section's page and its line on the Sections page. */
  description?: string;
}

/** Order matters: the homepage and footer list sections in this order. */
export const categories = [
  { slug: "life", name: "Life" },
  { slug: "tech", name: "Tech" },
] as const satisfies readonly Category[];

export const tags = [
  { slug: "writing", name: "Writing" },
  { slug: "habits", name: "Habits" },
  { slug: "learning", name: "Learning" },
  { slug: "react", name: "React" },
  { slug: "side-project", name: "Side Project" },
  { slug: "tailwind", name: "Tailwind" },
  { slug: "backend", name: "Backend" },
  { slug: "docker", name: "Docker" },
  { slug: "self-hosting", name: "Self Hosting" },
  { slug: "data-ownership", name: "Data Ownership" },
  { slug: "privacy", name: "Privacy" },
  { slug: "security", name: "Security" },
  { slug: "server", name: "Server" },
] as const satisfies readonly Term[];

export type CategorySlug = (typeof categories)[number]["slug"];
export type TagSlug = (typeof tags)[number]["slug"];
