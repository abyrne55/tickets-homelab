import { schemaMigration } from "./define.ts";

/**
 * Add `show_remaining` to listings so a listing can opt in to showing buyers
 * how many tickets are left on public booking pages. Default 0 ⇒ nothing
 * changes for existing listings; the column rides the wide
 * `SELECT listing.*` caches and backup/restore automatically.
 */
export default schemaMigration(
  "2026-11-09_listing_show_remaining",
  "Add show_remaining column to listings so a listing can show its remaining ticket count publicly.",
  {
    columns: { listings: ["show_remaining"] },
  },
);
