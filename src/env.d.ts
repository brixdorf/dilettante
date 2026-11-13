/// <reference types="astro/client" />

// Each post's slug and published date (milliseconds since 1970), made by scripts/post-dates.mjs.
declare module "virtual:post-dates" {
  const postDates: Readonly<Record<string, number>>;
  export default postDates;
}
