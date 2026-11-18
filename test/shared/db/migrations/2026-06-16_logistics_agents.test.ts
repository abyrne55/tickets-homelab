import { expect } from "@std/expect";
import { it as test } from "@std/testing/bdd";
import logisticsAgentsMigration from "#db/migrations/2026-06-16_logistics_agents.ts";
import { buildMigrationContext } from "#test-utils/migrations.ts";

test("keeps logistics agents as an inert historical migration", async () => {
  const migration = logisticsAgentsMigration(buildMigrationContext());

  expect(migration.id).toBe("2026-06-16_logistics_agents");
  expect(migration.description).toBe(
    "Historical logistics agents table and listing and attendee columns.",
  );
  expect(migration.requires).toEqual({});
  await expect(migration.up()).resolves.toBeUndefined();
});
