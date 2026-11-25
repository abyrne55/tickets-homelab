import { expect } from "@std/expect";
import { it as test } from "@std/testing/bdd";
import { getStorageBackend, uploadRaw } from "#shared/storage.ts";
import { describeWithEnv } from "#test-utils/db.ts";
import { withEnv } from "#test-utils/env.ts";
import {
  withLocalStorageEnabled,
  withStorageDisabled,
} from "#test-utils/mocks.ts";
import { STORAGE_TEST_ENV } from "./fixtures.ts";

describeWithEnv("storage environment config", STORAGE_TEST_ENV, () => {
  test("an empty local path keeps storage disabled", async () => {
    using _env = withEnv({ LOCAL_STORAGE_PATH: "" });
    expect(getStorageBackend()).toBe("none");
    await expect(
      uploadRaw(new Uint8Array([1]), "empty-local-path-test/file"),
    ).rejects.toThrow("Storage is not configured");
  });

  test("a scoped local path enables storage", async () => {
    await withLocalStorageEnabled(async () => {
      await Promise.resolve();
      expect(getStorageBackend()).toBe("local");
    });
  });

  test("an explicit disabled scope overrides environment config", async () => {
    using _env = withEnv({ LOCAL_STORAGE_PATH: "/tmp/env-local-path" });
    expect(getStorageBackend()).toBe("local");
    await withStorageDisabled(async () => {
      await Promise.resolve();
      expect(getStorageBackend()).toBe("none");
    });
  });
});
