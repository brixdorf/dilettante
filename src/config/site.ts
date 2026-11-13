export interface NavLink {
  label: string;
  href: string;
}

export interface SocialLink extends NavLink {
  /** A file name from `src/icons/bootstrap`, used as `social-<name>`. */
  icon: string;
  /** The name shown beside the icon on the Contact page, under "Find Me Here". */
  handle?: string;
}

// Romit's profiles elsewhere.
const github = {
  label: "GitHub",
  href: "https://github.com/brixdorf",
  icon: "github",
  handle: "@brixdorf",
} satisfies SocialLink;
const x = { label: "X", href: "https://x.com/brixdorf", icon: "twitter-x", handle: "@brixdorf" };
const linkedin = {
  label: "LinkedIn",
  href: "https://www.linkedin.com/in/romitrajsahu",
  icon: "linkedin",
  handle: "romitrajsahu",
} satisfies SocialLink;

export const siteConfig = {
  name: "A Dilettante's Journal",
  title: "A Dilettante's Journal",
  description: "A digital recollection of my ramblings",
  siteUrl: "https://blog.romitraj.dev",
  language: "en",
  locale: "en_US",
  dateLocale: "en-US",
  socialImage: "/og-image.png",

  /** Used to estimate read time when a post has no `readingTime`. */
  wordsPerMinute: 220,

  email: "hi@romitraj.dev",

  /** Romit's OpenPGP public key, in `public/`. The Contact page reads its facts from the file. */
  pgpKey: "/romitraj-pgp-public.asc",

  /**
   * Rybbit analytics and Remark42 comments run on Romit's own servers. They load only when the
   * page is on the live site (`siteUrl`), never locally.
   */
  analytics: {
    scriptUrl: "https://analytics.romitraj.dev/api/script.js",
    siteId: "baf839ddf444",
  },
  comments: {
    host: "https://comments.romitraj.dev",
    siteId: "dilettante",
  },

  /**
   * Romit's profiles, in this order on the Contact page under "Find Me Here", and in the author's
   * structured data (`sameAs`), which tells search engines they are the same person.
   */
  profiles: [github, x, linkedin] satisfies SocialLink[],

  /** The icons in the footer, followed by email. */
  socials: [x, github, linkedin] satisfies SocialLink[],
};

export const navigation: NavLink[] = [
  { label: "Writing", href: "/blog/" },
  { label: "Sections", href: "/categories/" },
  { label: "About", href: "/about/" },
  { label: "Contact", href: "/contact/" },
];

export const footerLinks: NavLink[] = [
  { label: "Archive", href: "/blog/" },
  { label: "Contributors", href: "/authors/" },
  { label: "Tags", href: "/tags/" },
  { label: "About", href: "/about/" },
  { label: "Contact", href: "/contact/" },
  { label: "RSS feed", href: "/rss.xml" },
];
