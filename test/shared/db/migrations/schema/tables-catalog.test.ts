import { expect } from "@std/expect";
import { it as test } from "@std/testing/bdd";
import { catalogTables } from "#db/migrations/schema/tables-catalog.ts";
import { jsonHash } from "#test-utils/hash.ts";

test("keeps the complete catalog schema exact", async () => {
  expect(await jsonHash(catalogTables)).toBe(
    "c58eac7e222504565a08cf472f9d81bd4cebe5357ba2839a2d42e8c22cf9a8c6",
  );
});

test("keeps a group's stored door and visibility defaults", () => {
  const groups = catalogTables.find(([name]) => name === "groups");
  if (!groups) throw new Error("groups schema is missing");

  expect(groups[1].columns).toContainEqual([
    "show_hidden_listings",
    "INTEGER NOT NULL DEFAULT 1",
  ]);
  // The door default keeps one listing admitted per scan until a group ticks
  // its checkbox.
  expect(groups[1].columns).toContainEqual([
    "scan_checks_in_all_listings",
    "INTEGER NOT NULL DEFAULT 0",
  ]);
});
