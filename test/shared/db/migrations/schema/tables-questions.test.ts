import { expect } from "@std/expect";
import { it as test } from "@std/testing/bdd";
import { questionTables } from "#db/migrations/schema/tables-questions.ts";
import { jsonHash } from "#test-utils/hash.ts";

test("keeps the complete question schema exact", async () => {
  expect(await jsonHash(questionTables)).toBe(
    "6b913ef1bdfe97091292a19184e566d59d8320d29f66bd2ed35b4d915daa29e4",
  );
});
