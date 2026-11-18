import { expect } from "@std/expect";
import { describe, it as test } from "@std/testing/bdd";
import { CONFIG_KEY_NAMES, CONFIG_KEYS } from "#shared/settings/keys.ts";
import { jsonHash } from "#test-utils/hash.ts";

describe("settings keys", () => {
  test("maps every key name to its lowercase stored value", () => {
    expect(Object.values(CONFIG_KEYS)).toEqual(
      CONFIG_KEY_NAMES.map((name) => name.toLowerCase()),
    );
  });

  test("keeps the complete public key catalog exact", async () => {
    expect(await jsonHash(CONFIG_KEY_NAMES)).toBe(
      "9566f0fa2985bc9229474b867d237cb736e1157596ed8986116dfcc9d330d142",
    );
  });

  test("does not register retired maintenance timestamps", () => {
    expect(
      Object.keys(CONFIG_KEYS).filter(
        (name) =>
          name.startsWith("LAST_PRUNED_") ||
          name === "LAST_ACTIVITY_LOG_BACKFILL" ||
          name === "ACTIVITY_LOG_BACKFILL_DONE",
      ),
    ).toEqual([]);
  });
});
