import { defineMiddleware } from "astro:middleware";

// The Keystatic admin and its API, and everything under them.
const KEYSTATIC_PATH = /^\/(?:api\/)?keystatic(?:\/|$)/;

// Tells search engines not to list a response.
const noindex = (response: Response) => {
  try {
    response.headers.set("X-Robots-Tag", "noindex");
    return response;
  } catch {
    // Some responses (redirects made with Response.redirect) cannot be changed; copy those.
    const copy = new Response(response.body, response);
    copy.headers.set("X-Robots-Tag", "noindex");
    return copy;
  }
};

export const onRequest = defineMiddleware(async (context, next) => {
  const response = await next();
  return KEYSTATIC_PATH.test(context.url.pathname) ? noindex(response) : response;
});
