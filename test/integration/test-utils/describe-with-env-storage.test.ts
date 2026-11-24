import { expect } from "@std/expect";
import { afterAll, describe, test } from "@std/testing/bdd";
import { getStorageBackend, isStorageEnabled } from "#shared/storage.ts";
import { describeWithEnv } from "#test-utils/db.ts";
import { getTestStoragePath } from "#test-utils/internal.ts";
import { withStorageDisabled } from "#test-utils/mocks.ts";

const dirExists = (path: string): boolean => {
  try {
    return Deno.statSync(path).isDirectory;
  } catch {
    return false;
  }
};

/** Assert the local backend picked a real, live temp dir, and return it. */
const expectLiveLocalDir = (): string => {
  const dir = getTestStoragePath();
  expect(dir).not.toBeNull();
  expect(dirExists(dir!)).toBe(true);
  expect(getStorageBackend()).toBe("local");
  return dir!;
};

describe("describeWithEnv storage option", () => {
  describe("local backend", () => {
    // Each test records the live dir it observed; the afterAll then proves that
    // dir was torn down. This holds no matter which subset of tests runs (e.g.
    // under `test:files --filter`), so the cases stay independent.
    let observedDir: string | null = null;

    describeWithEnv("local storage lifecycle", { storage: "local" }, () => {
      test("allocates a real temp dir and selects the local backend", () => {
        const dir = expectLiveLocalDir();
        expect(isStorageEnabled()).toBe(true);
        observedDir = dir;
      });

      test("a per-test withStorageDisabled scope overrides the suite default", () => {
        // This test has its own live dir…
        const dir = expectLiveLocalDir();
        // …but an explicit scope wins over the suite's env default.
        withStorageDisabled(() => {
          expect(getStorageBackend()).toBe("none");
        });
        observedDir = dir;
      });
    });

    afterAll(() => {
      // After the suite, the last-observed dir is removed and the path cleared —
      // proving each test's dir is torn down in its afterEach.
      expect(observedDir).not.toBeNull();
      expect(dirExists(observedDir!)).toBe(false);
      expect(getTestStoragePath()).toBeNull();
    });
  });

  describeWithEnv("no storage option", {}, () => {
    test("leaves storage disabled by default", () => {
      expect(getStorageBackend()).toBe("none");
      expect(getTestStoragePath()).toBeNull();
    });
  });

  // Regression: the storage option must resolve the backend through a typed
  // StorageConfig (layered under runWithStorageConfig, over env) and must NOT
  // mutate LOCAL_STORAGE_PATH — reintroducing that env-var route
  // is exactly the race AsyncLocalStorage was added to avoid. A suite that pins
  // a sentinel value for it must still resolve local from config, and
  // find every sentinel untouched afterwards. Fails on the prior env-based
  // implementation, which overwrote LOCAL_STORAGE_PATH and cleared the zone vars.
  describeWithEnv(
    "storage option resolves via config, not env vars",
    {
      env: {
        LOCAL_STORAGE_PATH: "sentinel-path",
      },
      storage: "local",
    },
    () => {
      test("selects local from config while leaving the env sentinels intact", () => {
        expect(getStorageBackend()).toBe("local");
        expect(Deno.env.get("LOCAL_STORAGE_PATH")).toBe("sentinel-path");
      });
    },
  );
});
