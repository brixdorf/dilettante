const siteUrl = (
  import.meta.env.SITE_URL ||
  import.meta.env.PUBLIC_SITE_URL ||
  "https://blog.romitraj.dev"
).replace(/\/$/, "");

export const SITE = {
  name: "A Dilettante's Journal",
  description:
    "A digital recollection of my ramblings",
  url: siteUrl,
  locale: "en-US",
  language: "en",
  repositoryUrl: "https://github.com/brixdorf/dilettante",
};

export const NAVIGATION = [
  { to: "/", label: "Home" },
  { to: "/blog", label: "Writing" },
  { to: "/about", label: "About" },
  { to: "/contact", label: "Contact" },
];

export const CONTACT = {
  email: "itsromit@protonmail.com",
  socialHandle: "@brixdorf",
  socialUrl: "https://x.com/brixdorf",
};

export const SOCIAL_LINKS = [
  { href: "/rss.xml", label: "RSS feed", icon: "rss" },
  { href: CONTACT.socialUrl, label: `${SITE.name} on X`, icon: "twitter" },
  { href: SITE.repositoryUrl, label: `${SITE.name} on GitHub`, icon: "github" },
  { href: `mailto:${CONTACT.email}`, label: "Email", icon: "mail" },
];

export const authors = [
  {
    slug: "romit",
    name: "Romit Raj Sahu",
    bio: "I write about tech and non-tech whenever I feel like it.",
    longBio:
      "I have interests in lots of avenues of science, literature and life. I like to share my experiences and journey with others through writing. Watch, Learn, and Grow. Act > Think",
    avatar: "/avatars/romit.svg",
  },
];

export const categories = [
  { slug: "life", name: "Life" },
  { slug: "tech", name: "Tech" },
];

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
];
