/**
 * Where a database runs, worked out from its address alone. This module is
 * pure: callers pass a URL, it never reads the environment.
 */
export type DatabaseHost = "local" | "remote";

/** Database addresses that are not one of these are a local file. */
const REMOTE_SCHEMES = ["libsql:", "https:"];

/** Say whether the database at this address is a local file or remote. */
export const databaseHostFor = (url: string): DatabaseHost => {
  if (!URL.canParse(url)) return "local";
  return REMOTE_SCHEMES.includes(new URL(url).protocol) ? "remote" : "local";
};
