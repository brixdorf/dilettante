import type { ImageMetadata } from "astro";
import { siteConfig } from "./site";

export interface Author {
  /** What a post's `author` field refers to, and the URL: `/authors/<slug>/`. */
  slug: string;
  name: string;
  /** Shown under the name in the article byline, the author note, and the author pages. */
  role: string;
  /** One line, on the Contributors page and in the author page's meta description. */
  bio: string;
  /** The standfirst on the author's page and the author note at the end of every article. */
  longBio: string;
  /** An imported image, or the path of a drawing in `public/`. */
  avatar: ImageMetadata | string;
  /** The author's profiles elsewhere, for search engines (`sameAs` in the structured data). */
  sameAs?: readonly string[];
}

export const authors = [
  {
    slug: "romit",
    name: "Romit Raj Sahu",
    role: "Lifelong learner",
    bio: "I write about tech and non-tech whenever I feel like it.",
    longBio:
      "I have interests in lots of avenues of science, literature and life. I like to share my experiences and journey with others through writing. Watch, Learn, and Grow. Act > Think",
    avatar: "/avatars/romit.svg",
    sameAs: siteConfig.profiles.map((profile) => profile.href),
  },
] as const satisfies readonly Author[];

export type AuthorSlug = (typeof authors)[number]["slug"];
