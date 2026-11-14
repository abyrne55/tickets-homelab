// effects: pure
/** Display-only shortening of listing names on a group's public page: the
 * group name already heads the page, so a member named "Car Show 2026 VIP"
 * under the group "Car Show 2026" shows as "VIP". */

import type { PageListingRow } from "./availability.ts";

const SEPARATORS = /^[\s\-–—:|·/,]+/;
const BOUNDARY = /^[\s\p{P}]/u;

/** The name without the group-name prefix, or the full name when the prefix
 * doesn't match at a word boundary or nothing would be left. */
export const shortListingName =
  (groupName: string) =>
  (name: string): string => {
    const prefix = groupName.trim().toLowerCase();
    if (prefix === "") return name;
    const trimmed = name.trim();
    if (!trimmed.toLowerCase().startsWith(prefix)) return name;
    const rest = trimmed.slice(prefix.length);
    if (rest === "" || !BOUNDARY.test(rest)) return name;
    const short = rest.replace(SEPARATORS, "");
    return short === "" ? name : short;
  };

/** Rows with each listing's display name shortened; unchanged when there is
 * no prefix. Ids, nodes and field names are untouched. */
export const withShortNames = (
  groupName: string | undefined,
  rows: readonly PageListingRow[],
): PageListingRow[] => {
  if (groupName === undefined) return [...rows];
  const shorten = shortListingName(groupName);
  return rows.map((row) => ({
    ...row,
    info: {
      ...row.info,
      listing: { ...row.info.listing, name: shorten(row.info.listing.name) },
    },
  }));
};
