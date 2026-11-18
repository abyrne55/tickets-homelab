import { expect } from "@std/expect";
import { it as test } from "@std/testing/bdd";
import addressCacheMigration from "#db/migrations/2026-07-05_address_cache.ts";
import { buildMigrationContext } from "#test-utils/migrations.ts";

test("keeps the address cache as an inert historical migration", async () => {
  const migration = addressCacheMigration(buildMigrationContext());

  expect(migration.id).toBe("2026-07-05_address_cache");
  expect(migration.description).toBe("Historical address-lookup result cache.");
  expect(migration.requires).toEqual({});
  await expect(migration.up()).resolves.toBeUndefined();
});
