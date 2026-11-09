import { expect } from "@std/expect";
import { it as test } from "@std/testing/bdd";
import { getDb } from "#db/client.ts";
import listingShowRemaining from "#db/migrations/2026-11-09_listing_show_remaining.ts";
import {
  applySchemaChanges,
  getExistingColumns,
  syncIndexes,
} from "#db/migrations/schema-sync.ts";
import { describeWithEnv } from "#test-utils/db.ts";
import { buildMigrationContext } from "#test-utils/migrations.ts";

const context = buildMigrationContext({ applySchemaChanges, syncIndexes });
const migration = () => listingShowRemaining(context);

describeWithEnv(
  "db > migrations > listing show remaining",
  { db: true },
  () => {
    test("adds the column", async () => {
      await getDb().execute("ALTER TABLE listings DROP COLUMN show_remaining");
      await migration().up();
      expect((await getExistingColumns("listings")).has("show_remaining")).toBe(
        true,
      );
    });

    test("declares every object it owns", () => {
      expect(migration().id).toBe("2026-11-09_listing_show_remaining");
      expect(migration().requires).toEqual({
        columns: { listings: ["show_remaining"] },
      });
    });
  },
);
