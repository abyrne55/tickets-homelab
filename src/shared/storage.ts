/**
 * Local filesystem storage for uploaded images and listing attachments.
 * Only enabled when LOCAL_STORAGE_PATH is set; the path must be under /data
 * in the container. Files are encrypted with DB_ENCRYPTION_KEY before they
 * are written.
 */

import { decryptBytes, encryptBytes } from "#crypto/encryption.ts";
import { lazyRef } from "#fp";
import { getEnv } from "#shared/env.ts";
import { formatBytes } from "#shared/format-units.ts";
import {
  canDecodeImageMime,
  type DecodableMime,
  IMAGE_FORMATS,
  IMAGE_MIMES,
  type ImageMime,
} from "#shared/images/formats.ts";
import type { ImageTargetTranscoder } from "#shared/images/transcode.ts";
import { MAX_ATTACHMENT_SIZE, MAX_IMAGE_SIZE } from "#shared/limits.ts";
import { sortByName } from "#shared/name-order.ts";
import { createScopedValue } from "#shared/request-scoped.ts";
import { getDeleteOverride } from "#shared/test-overrides.ts";

// ---------------------------------------------------------------------------
// Per-context storage config (eliminates env var races in concurrent tests)
// ---------------------------------------------------------------------------

interface StorageConfig {
  /** Override local storage path for tests. "" = disabled, undefined = use env var. */
  localPath?: string;
}

// Suite-level storage config for tests (describeWithEnv's `storage` option).
// Layered *under* the per-call runWithStorageConfig scope and *over* the process
// env, so a whole suite can declare its backend once — without wrapping each test
// body or mutating the LOCAL_STORAGE_PATH env var. Held as a typed
// StorageConfig object, not env strings, so it can't reintroduce the env-var
// races runWithStorageConfig exists to avoid; a per-test runWithStorageConfig
// scope still wins over it.
const [getTestStorageConfig, storageConfigRef] = lazyRef<StorageConfig | null>(
  () => null,
);

/** The test-supplied config: the per-call scope first, else the suite-level
 * default, else null (⇒ read the process env). */
const configOverride = createScopedValue<StorageConfig | null>(
  getTestStorageConfig,
);

/** Run `fn` with an isolated storage configuration (test-only). */
export const runWithStorageConfig = <T>(
  config: StorageConfig,
  fn: () => T,
): T => configOverride.run(config, fn);

/**
 * Test-only: set the suite-level storage config that describeWithEnv's `storage`
 * option applies. A directly-exported named function (not an `export {}` list,
 * which the test-hook scanner does not detect, nor a module-level alias) so it is
 * visible to and registered in `ALLOWED_TEST_HOOKS`
 * (test/lib/code-quality.test.ts), alongside `runWithStorageConfig`.
 */
export function setStorageConfigForTest(config: StorageConfig | null): void {
  storageConfigRef(config);
}

/**
 * Get the effective local storage path.
 * Returns null if local storage is not configured or explicitly disabled.
 */
const getLocalStoragePath = (): string | null => {
  const ctx = configOverride.read();
  if (ctx && "localPath" in ctx) {
    return ctx.localPath || null;
  }
  return getEnv("LOCAL_STORAGE_PATH") || null;
};

/** Derived lookup: file extension → MIME type, for serving stored files. */
const EXT_TO_MIME = Object.fromEntries(
  IMAGE_MIMES.map((mime) => [IMAGE_FORMATS[mime].extension, mime]),
) as Record<string, ImageMime>;

/**
 * Returns which storage backend is active: "local" or "none".
 */
export const getStorageBackend = (): "local" | "none" =>
  getLocalStoragePath() ? "local" : "none";

/**
 * Check if image storage is enabled (local filesystem).
 */
export const isStorageEnabled = (): boolean => getStorageBackend() !== "none";

/**
 * Get the MIME type for an image filename from its extension.
 */
export const getMimeTypeFromFilename = (filename: string): ImageMime | null => {
  const dotIndex = filename.lastIndexOf(".");
  if (dotIndex === -1) return null;
  return EXT_TO_MIME[filename.slice(dotIndex)] || null;
};

/**
 * Detect the actual image type from magic bytes.
 * Returns the MIME type if matched, null otherwise.
 */
export const detectImageType = (data: Uint8Array): ImageMime | null => {
  for (const mime of IMAGE_MIMES) {
    const { magic } = IMAGE_FORMATS[mime];
    const matches = magic.every(
      ({ bytes, offset }) =>
        data.length >= offset + bytes.length &&
        bytes.every((byte, index) => data[offset + index] === byte),
    );
    if (matches) {
      return mime;
    }
  }
  return null;
};

/** Image validation error */
export type ImageValidationError =
  | "too_large"
  | "invalid_type"
  | "invalid_content";

/** Image validation result */
export type ImageValidationResult =
  | { valid: true; detectedType: DecodableMime }
  | { valid: false; error: ImageValidationError };

/**
 * Validate an image file: check size, the declared MIME type, and the magic
 * bytes. Both the declared type and the sniffed content must be an accepted
 * upload format; a mismatch or an unsupported format (e.g.
 * a GIF, or a file whose bytes don't match any decodable format) is rejected.
 * On success, `detectedType` is the sniffed format the transcoder will decode.
 */
export const validateImage = (
  data: Uint8Array,
  contentType: string,
): ImageValidationResult => {
  if (data.byteLength > MAX_IMAGE_SIZE) {
    return { error: "too_large", valid: false };
  }

  if (!canDecodeImageMime(contentType)) {
    return { error: "invalid_type", valid: false };
  }

  const detectedType = detectImageType(data);
  if (!detectedType || !canDecodeImageMime(detectedType)) {
    return { error: "invalid_content", valid: false };
  }

  return { detectedType, valid: true };
};

/** User-facing messages for image validation errors */
export const IMAGE_ERROR_MESSAGES: Record<ImageValidationError, string> = {
  invalid_content: "File does not appear to be a valid image",
  invalid_type: "Image must be a JPEG, PNG, or WebP file",
  too_large: `Image exceeds the ${formatBytes(MAX_IMAGE_SIZE)} size limit`,
};

/** Generate a random `.webp` filename. Every uploaded image is transcoded to
 * WebP, so stored image variants always carry the `.webp` extension. */
export const generateWebpFilename = (): string => `${crypto.randomUUID()}.webp`;

// ---------------------------------------------------------------------------
// Local filesystem backend
// ---------------------------------------------------------------------------

/** The configured local storage directory. Throws when storage is off. */
const requireLocalPath = (): string => {
  const dir = getLocalStoragePath();
  if (dir === null) {
    throw new Error("Storage is not configured. Set LOCAL_STORAGE_PATH.");
  }
  return dir;
};

/** Write encrypted bytes to the local storage directory. Filenames may include
 *  a subfolder (e.g. "acme/backup-…zip"), so create the file's parent first. */
const localWrite = async (
  data: Uint8Array,
  filename: string,
): Promise<void> => {
  const path = `${requireLocalPath()}/${filename}`;
  await Deno.mkdir(path.slice(0, path.lastIndexOf("/")), { recursive: true });
  await Deno.writeFile(path, data);
};

/** Read encrypted bytes from the local storage directory. Returns null if missing. */
const localRead = async (filename: string): Promise<Uint8Array | null> => {
  const dir = requireLocalPath();
  try {
    return await Deno.readFile(`${dir}/${filename}`);
  } catch (err) {
    if (err instanceof Deno.errors.NotFound) return null;
    throw err;
  }
};

/** Remove a file from the local storage directory */
const localRemove = async (filename: string): Promise<void> => {
  const dir = requireLocalPath();
  await Deno.remove(`${dir}/${filename}`);
};

/** Upload raw bytes to local storage */
export const uploadRaw = async (
  data: Uint8Array,
  filename: string,
): Promise<string> => {
  await localWrite(data, filename);
  return filename;
};

/** Encrypt and upload bytes */
const encryptAndUpload = async (
  data: Uint8Array,
  filename: string,
): Promise<string> => uploadRaw(await encryptBytes(data), filename);

/**
 * Transcode an uploaded image to WebP, one stored file per target, returned in
 * the order of `targets`.
 *
 * The image pipeline is about 1MB of codec wasm, so it is imported here on the
 * first upload and never at cold boot.
 */
export const uploadImageTargets: ImageTargetTranscoder<string[]> = async (
  data,
  mime,
  targets,
) => {
  const { transcodeToWebp } = await import("#shared/images/transcode.ts");
  const variants = await transcodeToWebp(data, mime, targets);
  return Promise.all(
    variants.map((bytes) => encryptAndUpload(bytes, generateWebpFilename())),
  );
};

/** Download raw bytes from storage. Returns null if the file does not exist. */
export const downloadRaw = (filename: string): Promise<Uint8Array | null> =>
  localRead(filename);

/**
 * Download and decrypt a file.
 * Returns the decrypted bytes, or null if the file does not exist.
 */
export const downloadImage = async (
  filename: string,
): Promise<Uint8Array | null> => {
  const encrypted = await downloadRaw(filename);
  if (encrypted === null) return null;
  return decryptBytes(encrypted);
};

/**
 * Delete a file from local storage.
 */
export const deleteFile = async (filename: string): Promise<void> => {
  const override = getDeleteOverride();
  if (override) throw override;
  await localRemove(filename);
};

// ---------------------------------------------------------------------------
// Attachment storage (any file type, up to 25MB)
// ---------------------------------------------------------------------------

// Re-export for existing consumers (imported from #shared/limits.ts at top)
export { MAX_ATTACHMENT_SIZE };

/** Attachment validation error */
export type AttachmentValidationError = "too_large";

/** Attachment validation result */
export type AttachmentValidationResult =
  | { valid: true }
  | { valid: false; error: AttachmentValidationError };

/**
 * Validate an attachment file: check size only (any file type allowed).
 */
export const validateAttachment = (
  data: Uint8Array,
): AttachmentValidationResult =>
  data.byteLength > MAX_ATTACHMENT_SIZE
    ? { error: "too_large", valid: false }
    : { valid: true };

/** User-facing messages for attachment validation errors */
export const ATTACHMENT_ERROR_MESSAGES: Record<
  AttachmentValidationError,
  string
> = {
  too_large: `Attachment exceeds the ${formatBytes(
    MAX_ATTACHMENT_SIZE,
  )} size limit`,
};

/** Extract the basename from a path (handles both forward and backslash separators) */
export const getBasename = (name: string): string =>
  name.split(/[/\\]/).pop() as string;

/** Strip a path's basename down with each `[pattern, replacement]` rule in
 * turn, falling back to "file" when nothing is left. Shared by every filename
 * sanitiser — each supplies its own character rules. */
export const sanitizeBasename = (
  name: string,
  ...rules: [RegExp, string][]
): string => {
  const cleaned = rules.reduce(
    (basename, [pattern, replacement]) =>
      basename.replace(pattern, replacement),
    getBasename(name),
  );
  return cleaned || "file";
};

/** Sanitize a filename for use in storage (strip path, collapse whitespace) */
const sanitizeFilename = (name: string): string =>
  sanitizeBasename(name, [/[^a-zA-Z0-9._-]/g, "_"]);

/** Generate a random storage filename preserving the original name for readability */
export const generateAttachmentFilename = (originalName: string): string =>
  `${crypto.randomUUID()}-${sanitizeFilename(originalName)}`;

/**
 * Upload an attachment to local storage.
 * Encrypts the file bytes before writing.
 * Uses the provided filename (caller generates via generateAttachmentFilename).
 * Returns the filename on success.
 */
export const uploadAttachment = (
  data: Uint8Array,
  filename: string,
): Promise<string> => encryptAndUpload(data, filename);

// ---------------------------------------------------------------------------
// File listing — used by backup to discover existing backup files
// ---------------------------------------------------------------------------

/** Read directory entries, returning empty array if the directory doesn't exist */
const readDirSafe = async (dir: string): Promise<Deno.DirEntry[]> => {
  try {
    return await Array.fromAsync(Deno.readDir(dir));
  } catch {
    return [];
  }
};

/** A stored file with its name and size in bytes. */
export type StorageFileMeta = { name: string; size: number };

/**
 * Split a listing prefix into the directory to read and the leaf-name filter
 * applied within it. The directory is matched as a real path component, not a
 * string prefix, so listing one folder can never leak into a sibling whose name
 * extends it ("acme/" vs "acme-test/"):
 *   "backup-"      → read the root,   keep names starting "backup-"
 *   "acme/"        → read "acme",     keep everything
 *   "acme/backup-" → read "acme",     keep names starting "backup-"
 */
const splitListingPrefix = (
  prefix: string,
): { dir: string; namePrefix: string } => {
  const slash = prefix.lastIndexOf("/");
  return slash === -1
    ? { dir: "", namePrefix: prefix }
    : { dir: prefix.slice(0, slash + 1), namePrefix: prefix.slice(slash + 1) };
};

/**
 * List files (with size metadata) matching a path prefix, sorted by name. The
 * prefix may name a subfolder (see `splitListingPrefix`); returned names always
 * include that folder so callers can download/delete them directly.
 */
export const listFilesWithMeta = async (
  prefix: string,
): Promise<StorageFileMeta[]> => {
  const { dir, namePrefix } = splitListingPrefix(prefix);
  const base = `${requireLocalPath()}/${dir}`;
  const entries = await readDirSafe(base);
  const files = await Promise.all(
    entries
      .filter((e) => e.isFile && e.name.startsWith(namePrefix))
      .map(async (e) => ({
        name: `${dir}${e.name}`,
        size: (await Deno.stat(`${base}${e.name}`)).size,
      })),
  );
  return sortByName(files);
};

/** List files in storage matching a prefix (names only), sorted by name. */
export const listFiles = async (prefix: string): Promise<string[]> =>
  (await listFilesWithMeta(prefix)).map((f) => f.name);
