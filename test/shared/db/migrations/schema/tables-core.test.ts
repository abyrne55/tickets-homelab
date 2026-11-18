import { expect } from "@std/expect";
import { it as test } from "@std/testing/bdd";
import { coreTables } from "#db/migrations/schema/tables-core.ts";
import { jsonHash } from "#test-utils/hash.ts";

test("keeps the complete core schema declaration exact", async () => {
  expect(await jsonHash(coreTables)).toBe(
    "68466ae5ac4662f967e9f091d4c4e6eadfa7bcde8e750ff3d4c51bfdb4da43f7",
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
