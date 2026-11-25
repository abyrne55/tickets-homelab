import { expect } from "@std/expect";
import { it as test } from "@std/testing/bdd";
import { coreTables } from "#db/migrations/schema/tables-core.ts";
import { jsonHash } from "#test-utils/hash.ts";

test("keeps the complete core schema declaration exact", async () => {
  expect(await jsonHash(coreTables)).toBe(
    "ecfd8bbf5fd4cbf6649d6e68e4bd66c3bdb0f42292a8f36fe2d6f0809712d73a",
  );
});

test("defines fenced maintenance task state and its due-work index", () => {
  expect(coreTables).toContainEqual([
    "maintenance_tasks",
    {
      columns: [
        ["name", "TEXT PRIMARY KEY"],
        ["checkpoint", "TEXT"],
        ["completed_at", "INTEGER"],
        ["next_run_at", "INTEGER NOT NULL"],
        ["lease_token", "TEXT"],
        ["lease_expires_at", "INTEGER"],
        ["last_started_at", "INTEGER"],
        [
          "last_finished_at",
          "INTEGER CHECK ((lease_token IS NULL) = (lease_expires_at IS NULL))",
        ],
      ],
      indexes: [
        {
          columns: ["next_run_at", "lease_expires_at", "name"],
          name: "idx_maintenance_tasks_due",
        },
      ],
    },
  ]);
});
