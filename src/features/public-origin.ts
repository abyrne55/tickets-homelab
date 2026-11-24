/** Shared response for the static public documents. */

import { encodeBody } from "#routes/response.ts";

/** A body with the short public cache: it follows settings an operator can
 *  flip, so no proxy holds it for long. /robots.txt and /sitemap.xml share
 *  it, so the two static documents cannot age differently. */
export const publicCacheResponse = (
  body: string,
  contentType: string,
): Response =>
  new Response(encodeBody(body), {
    headers: {
      "cache-control": "public, max-age=300",
      "content-type": contentType,
    },
  });
