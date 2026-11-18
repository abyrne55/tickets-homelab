import { expect } from "@std/expect";
import { it as test } from "@std/testing/bdd";
import agentUsersMigration from "#db/migrations/2026-06-16_agent_users.ts";
import { buildMigrationContext } from "#test-utils/migrations.ts";

test("keeps agent users as an inert historical migration", async () => {
  const migration = agentUsersMigration(buildMigrationContext());

  expect(migration.id).toBe("2026-06-16_agent_users");
  expect(migration.description).toBe(
    "Historical agent users link table and run-sheet completion flags.",
  );
  expect(migration.requires).toEqual({});
  await expect(migration.up()).resolves.toBeUndefined();
});
