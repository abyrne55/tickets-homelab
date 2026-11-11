/**
 * Static asset routes - CSS, JS, and favicon with long cache
 */

import { dirname, fromFileUrl, join } from "@std/path";
import { once } from "#fp";
import { encodeBody } from "#routes/response.ts";
import { CSS, JS, SVG } from "#shared/content-types.ts";

const currentDir = dirname(fromFileUrl(import.meta.url));
const staticDir = join(currentDir, "..", "ui", "static");

/** Cache for 1 year (immutable assets) */
const CACHE_HEADERS = {
  "cache-control": "public, max-age=31536000, immutable",
};

/** Create a handler that serves a static file with the given content type */
const staticHandler = (
  filename: string,
  contentType: string,
  headers: Record<string, string> = CACHE_HEADERS,
): (() => Response) => {
  const content = encodeBody(Deno.readTextFileSync(join(staticDir, filename)));
  return () =>
    new Response(content, {
      headers: { "content-type": contentType, ...headers },
    });
};

export const handleFavicon = staticHandler("favicon.svg", SVG);
export const handleIcons = staticHandler("icons.svg", SVG);
export const handleStyleCss = staticHandler("style.css", CSS);
export const handleAdminJs = staticHandler("admin.js", JS);
export const handleLogisticsMapCss = staticHandler("logistics-map.css", CSS);
export const handleLogisticsMapJs = staticHandler("logistics-map.js", JS);
export const handleMarkdownEditorJs = staticHandler("markdown-editor.js", JS);
export const handleScannerJs = staticHandler("scanner.js", JS);
/** The service worker must revalidate on every scanner page load, so an
 * updated worker registers instead of a year-old cached one. */
export const handleScannerSwJs = staticHandler("scanner-sw.js", JS, {
  "cache-control": "no-cache",
});
export const handleEmbedJs = staticHandler("embed.js", JS);
export const handleContactJs = staticHandler("contact.js", JS);
export const handleIframeResizerParentJs = staticHandler(
  "iframe-resizer-parent.js",
  JS,
);
export const handleIframeResizerChildJs = staticHandler(
  "iframe-resizer-child.js",
  JS,
);

/** Self-hosted WOFF2 files for the public pages. Only names listed here are
 * ever read from disk, so the route can't be used to walk the filesystem. */
export const FONT_FILES: readonly string[] = [
  "figtree-latin-wght-normal.woff2",
];

const fontCache = new Map<string, Uint8Array<ArrayBuffer>>();
const fontBody = (file: string): Uint8Array<ArrayBuffer> => {
  const cached = fontCache.get(file);
  if (cached) return cached;
  const bytes = Deno.readFileSync(join(staticDir, "fonts", file));
  fontCache.set(file, bytes);
  return bytes;
};

/** Serve one allow-listed font file with the immutable year-long cache. */
export const handleFont = (file: string): Response =>
  FONT_FILES.includes(file)
    ? new Response(fontBody(file), {
        headers: { "content-type": "font/woff2", ...CACHE_HEADERS },
      })
    : new Response("Not found", { status: 404 });

/** The raw ESM body of the external-order widget (`/order.js`). Exposed here —
 * rather than read in the handler — so the edge build inlines it the same way
 * it inlines the other static assets. The dynamic `/order.js` route prepends
 * the per-request catalog to this string. Returns the unencoded source text.
 *
 * The widget body never changes for the life of the process, and `/order.js` is
 * hit on every embedding page load. The file is read once and cached. (The
 * edge build replaces this whole module with a pre-inlined constant. The cache
 * only spares the per-request `readTextFileSync` on the Deno dev/Deploy path.) */
export const orderWidgetBody = once((): string =>
  Deno.readTextFileSync(join(staticDir, "order.js")),
);
