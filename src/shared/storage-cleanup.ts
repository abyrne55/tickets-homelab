/** Record-file cleanup: the per-record deletions and the whole-table sweeps
 *  the database reset runs. The storage backend operations they call live in
 *  `src/shared/storage.ts`. */

import { ErrorCode, logError } from "#shared/logger.ts";
import { deleteFile } from "#shared/storage.ts";
import type { NonEmptyString } from "#shared/validation/string.ts";

/** Try to delete a file from storage, logging errors on failure */
export const tryDeleteFile = async (
  filename: string,
  listingId: number | undefined,
  detail: string,
): Promise<void> => {
  try {
    await deleteFile(filename);
  } catch {
    logError({ code: ErrorCode.STORAGE_DELETE, detail, listingId });
  }
};

/** Listing shape that owns an attachment file */
type ListingWithAttachmentStorage = {
  id: number;
  attachment_url: string;
};

/** Image shape that owns storage files */
type ImageWithStorage = {
  id: number;
  filename: NonEmptyString;
  filename_thumb: NonEmptyString;
};

/** Delete the attachment file for a single listing */
export const deleteListingAttachmentFile = async (
  listing: ListingWithAttachmentStorage,
  reason: string,
): Promise<void> => {
  if (listing.attachment_url) {
    await tryDeleteFile(listing.attachment_url, listing.id, reason);
  }
};

/** True for a "the file is already gone" deletion error from either backend, so
 * a retried delete treats an already-removed file as success. */
const isAlreadyDeleted = (err: unknown): boolean =>
  err instanceof Error &&
  (err.message.startsWith("File not found:") || err.name === "NotFound");

/**
 * Delete an image's storage files. Throws when a file stays in place. A file
 * that is already gone counts as success, so retries are safe. Unlike the
 * reason-tagged deletions above, this runs outside a larger transaction.
 */
export const deleteImageStorageFilesStrict = async (
  image: ImageWithStorage,
): Promise<void> => {
  const results = await Promise.allSettled([
    deleteFile(image.filename),
    deleteFile(image.filename_thumb),
  ]);
  const failure = results
    .filter((r): r is PromiseRejectedResult => r.status === "rejected")
    .map((r) => r.reason)
    .find((reason) => !isAlreadyDeleted(reason));
  if (failure) throw failure;
};
