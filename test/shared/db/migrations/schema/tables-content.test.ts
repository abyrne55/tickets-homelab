import { expect } from "@std/expect";
import { it as test } from "@std/testing/bdd";
import { contentTables } from "#db/migrations/schema/tables-content.ts";
import { jsonHash } from "#test-utils/hash.ts";

test("keeps the complete content schema declaration exact", async () => {
  expect(await jsonHash(contentTables)).toBe(
    "01db434ad172e7dba32b8e8bb8ec0ca2e30531142ce04eb89d58c2a2e555d115",
  );
});

test("declares the refund-order link on every transfer and indexes it", () => {
  const transfers = contentTables.find(([name]) => name === "transfers");
  if (!transfers) throw new Error("transfers schema is missing");
  expect(transfers[1].columns).toContainEqual([
    "reverses_group",
    "TEXT NOT NULL DEFAULT ''",
  ]);
  expect(transfers[1].indexes).toContainEqual({
    columns: ["reverses_group"],
    name: "idx_transfers_reverses_group",
  });
});
