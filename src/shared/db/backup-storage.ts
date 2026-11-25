import { databaseHostFor } from "#db/host.ts";
import { compact } from "#fp";
import { requireEnv } from "#shared/env.ts";
import { MAX_BACKUPS } from "#shared/limits.ts";
import { parseDateMs } from "#shared/now.ts";
import { deleteFile, getBasename, listFiles } from "#shared/storage.ts";

/** Check if DB_URL points to a remote database */
export const isRemoteDatabase = (): boolean =>
  databaseHostFor(requireEnv("DB_URL")) !== "local";

/**
 * Extract a short database name from DB_URL for use in backup filenames.
 * A remote host keeps its full first hostname segment
 * ("libsql://tickets-spencer.example.com/" → "tickets-spencer"). Local and
 * unparseable URLs are filed under "local", so backups never land in a
 * nameless folder.
 */
export const dbName = (url: string = requireEnv("DB_URL")): string => {
  if (databaseHostFor(url) === "local") return "local";

  return new URL(url).hostname.split(".")[0]!;
};

/**
 * Per-site folder that scopes a database's backups within shared storage
 * (defaults to the current DB; pass a name from `dbName(url)` to target another
 * instance). Because it is a real path segment — not a name prefix — listing one
 * site's folder can never pick up another's, even when one db name is a string
 * prefix of another ("tickets" vs "tickets-spencer").
 */
export const backupDir = (name: string = dbName()): string => `${name}/`;

/** Leaf filename for a backup taken at `timestamp`, e.g.
 *  "backup-2024-01-15T12-30-00-000Z.zip". Lives inside `backupDir()`. */
export const backupLeaf = (timestamp: string): string =>
  `backup-${timestamp}.zip`;

/** Full storage key for a backup: "{name}/backup-{timestamp}.zip". Defaults to
 *  the current DB; pass a name to target another instance. */
export const backupKey = (timestamp: string, name: string = dbName()): string =>
  `${backupDir(name)}${backupLeaf(timestamp)}`;

/** Generate a timestamp string for backup filenames */
export const backupTimestamp = (date = new Date()): string =>
  date.toISOString().replace(/[:.]/g, "-");

/** ISO-8601-ish timestamp as it appears in a backup filename (":"/"." → "-"),
 *  with the date/time pieces captured so parseBackupTime can rebuild the real
 *  ISO string. Defined once and reused by every backup-filename matcher. */
const BACKUP_TIMESTAMP = String.raw`(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z`;

/** Matches the "{timestamp}.zip" tail at the end of a backup key. */
const BACKUP_TIME_TAIL = new RegExp(`${BACKUP_TIMESTAMP}\\.zip$`);

/** Matches a leaf that is *exactly* "backup-{timestamp}.zip" — no directory and
 *  no extra characters, so it also rejects any path separators. */
const BACKUP_LEAF = new RegExp(`^backup-${BACKUP_TIMESTAMP}\\.zip$`);

/**
 * Parse the epoch-ms encoded in a backup filename, or null if it doesn't match.
 * Inverse of backupTimestamp: "…/backup-2024-01-15T12-30-00-000Z.zip" → epoch ms.
 */
export const parseBackupTime = (filename: string): number | null => {
  const m = filename.match(BACKUP_TIME_TAIL);
  if (!m) return null;
  return parseDateMs(`${m[1]}T${m[2]}:${m[3]}:${m[4]}.${m[5]}Z`);
};

/** True when a bare leaf name is exactly "backup-{timestamp}.zip". Anchored, so
 *  it also doubles as traversal-proofing for the download route's filename. */
export const isBackupLeaf = (leaf: string): boolean => BACKUP_LEAF.test(leaf);

/** True when a storage key ("{name}/backup-…zip") is one of our backups — i.e.
 *  its leaf is a valid backup filename. Picks backups out of a folder listing
 *  while ignoring anything else stored alongside them. */
export const isBackupPath = (key: string): boolean =>
  isBackupLeaf(getBasename(key));

/**
 * Purge the oldest backups beyond `keep` for the current DB, keeping the
 * newest. Filenames embed ISO timestamps, so name order is chronological.
 * Deletes run in parallel and are best-effort — a failed delete never blocks
 * backup creation. Returns the filenames that were removed.
 */
export const pruneOldBackups = async (
  keep = MAX_BACKUPS,
): Promise<string[]> => {
  const files = await listFiles(backupDir());
  const stale = files.filter(isBackupPath).reverse().slice(keep);
  const removed = await Promise.all(
    stale.map(async (file) => {
      try {
        await deleteFile(file);
        return file;
      } catch {
        return null;
      }
    }),
  );
  return compact(removed);
};
