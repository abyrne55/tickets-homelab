/** Record-file cleanup pins, moved beside src/shared/storage-cleanup.ts with
 *  the strict deletion it exercises. */

import { expect } from "@std/expect";
import { describe, it as test } from "@std/testing/bdd";
import { deleteImageStorageFilesStrict } from "#shared/storage-cleanup.ts";
import { setDeleteOverride } from "#shared/test-overrides.ts";
import { nonEmptyString } from "#shared/validation/string.ts";
import { describeWithEnv } from "#test-utils/db.ts";
import { STORAGE_TEST_ENV } from "./storage/fixtures.ts";

const image = {
  filename: nonEmptyString("image.webp"),
  filename_thumb: nonEmptyString("image-thumb.webp"),
  id: 7,
};

const withDeleteError = async (
  error: Error,
  action: () => Promise<void>,
): Promise<void> => {
  setDeleteOverride(error);
  try {
    await action();
  } finally {
    setDeleteOverride(null);
  }
};

describeWithEnv("storage record cleanup", STORAGE_TEST_ENV, () => {
  describe("strict image deletion", () => {
    test("accepts an already missing file by error name", async () => {
      const missing = new Deno.errors.NotFound("already gone");
      await withDeleteError(missing, async () => {
        await expect(
          deleteImageStorageFilesStrict(image),
        ).resolves.toBeUndefined();
      });
    });

    test("throws a genuine storage failure", async () => {
      await withDeleteError(new Error("delete failed"), async () => {
        await expect(deleteImageStorageFilesStrict(image)).rejects.toThrow(
          "delete failed",
        );
      });
    });
  });
});
