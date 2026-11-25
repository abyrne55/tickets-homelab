import { expect } from "@std/expect";
import { it as test } from "@std/testing/bdd";
import { decrypt, encrypt } from "#crypto/encryption.ts";
import type { EnvKeyEncrypted } from "#crypto/sealed.ts";
import { getDb, queryOne } from "#db/client.ts";
import removeHostingPlatformMigration from "#db/migrations/2026-11-24_remove_hosting_platform.ts";
import {
  recreateTable,
  syncIndexes,
  syncTriggers,
} from "#db/migrations/schema-sync.ts";
import { describeWithEnv } from "#test-utils/db.ts";
import {
  buildMigrationContext,
  settingsValueOrNull,
  tableExists,
} from "#test-utils/migrations.ts";

const context = buildMigrationContext({
  recreateTable,
  syncIndexes,
  syncTriggers,
});
const runMigration = (): Promise<void> =>
  removeHostingPlatformMigration(context).up();

const execute = (sql: string, args: (string | number)[] = []) =>
  getDb().execute({ args, sql });

const columnNames = async (table: string): Promise<string[]> =>
  (await execute(`PRAGMA table_info(${table})`)).rows.map((row) =>
    String(row.name),
  );

const RETIRED_SETTING_KEYS = [
  "superuser_choice",
  "support_form_last_submitted",
  "latest_script_version",
  "latest_script_version_name",
  "current_script_version",
  "current_script_commit",
  "custom_css_bunny_fonts",
  "custom_domain",
  "custom_domain_last_validated",
  "bunny_subdomain",
];

/** The schema as the release before this one left it: the built_sites table
 * and the three site-plan listing columns. */
const seedOldSchema = async (): Promise<void> => {
  await execute(
    "CREATE TABLE built_sites (id INTEGER PRIMARY KEY AUTOINCREMENT, site_data TEXT NOT NULL, created TEXT NOT NULL)",
  );
  for (const column of [
    "assign_built_site INTEGER NOT NULL DEFAULT 0",
    "months_per_unit INTEGER NOT NULL DEFAULT 0",
    "initial_site_months INTEGER NOT NULL DEFAULT 0",
  ]) {
    await execute(`ALTER TABLE listings ADD COLUMN ${column}`);
  }
};

describeWithEnv(
  "db > migrations > 2026-11-24_remove_hosting_platform",
  { db: true },
  () => {
    test("declares its id, description and absent tables", () => {
      const migration = removeHostingPlatformMigration(context);
      expect(migration.id).toBe("2026-11-24_remove_hosting_platform");
      expect(migration.description).toBe(
        "Remove the hosting platform: drop built_sites and the site-plan listing columns, and retire the settings of the superuser, self-update, Bunny and custom domain features.",
      );
      expect(migration.requires?.absentTables).toEqual(["built_sites"]);
    });

    test("drops built_sites and the site-plan listing columns", async () => {
      await seedOldSchema();
      await execute(
        "INSERT INTO built_sites (site_data, created) VALUES ('{}', '2026-01-01')",
      );

      await runMigration();

      expect(await tableExists("built_sites")).toBe(false);
      const columns = await columnNames("listings");
      for (const column of [
        "assign_built_site",
        "months_per_unit",
        "initial_site_months",
      ]) {
        expect(columns).not.toContain(column);
      }
    });

    test("keeps listings and their data", async () => {
      await seedOldSchema();
      await execute(
        "INSERT INTO listings (id, created, max_attendees, name, slug, slug_index, months_per_unit) VALUES (1, '2026-01-01', 10, 'Kept listing', 'kept', 'kept-index', 3)",
      );

      await runMigration();

      expect(
        await queryOne("SELECT name, max_attendees FROM listings WHERE id = 1"),
      ).toEqual({ max_attendees: 10, name: "Kept listing" });
    });

    test("deletes the retired settings and keeps unrelated ones", async () => {
      await seedOldSchema();
      for (const key of [...RETIRED_SETTING_KEYS, "business_email"]) {
        await execute(
          "INSERT OR REPLACE INTO settings (key, value) VALUES (?, 'x')",
          [key],
        );
      }

      await runMigration();

      for (const key of RETIRED_SETTING_KEYS) {
        expect(await settingsValueOrNull(key)).toBeNull();
      }
      expect(await settingsValueOrNull("business_email")).toBe("x");
    });

    test("drops the site-plan keys from the stored listing defaults and keeps the rest", async () => {
      await seedOldSchema();
      await execute(
        "INSERT OR REPLACE INTO settings (key, value) VALUES ('listing_defaults', ?)",
        [
          await encrypt(
            '{"hidden":true,"assignBuiltSite":true,"monthsPerUnit":3,"initialSiteMonths":6}',
          ),
        ],
      );

      await runMigration();

      const stored = (await settingsValueOrNull("listing_defaults"))!;
      expect(stored).toMatch(/^enc:1:/);
      expect(JSON.parse(await decrypt(stored as EnvKeyEncrypted))).toEqual({
        hidden: true,
      });
    });

    test("leaves listing defaults without those keys untouched", async () => {
      await seedOldSchema();
      const original = await encrypt('{"hidden":true}');
      await execute(
        "INSERT OR REPLACE INTO settings (key, value) VALUES ('listing_defaults', ?)",
        [original],
      );

      await runMigration();

      expect(await settingsValueOrNull("listing_defaults")).toBe(original);
    });

    test("leaves absent listing defaults absent", async () => {
      await seedOldSchema();
      await execute("DELETE FROM settings WHERE key = 'listing_defaults'");

      await runMigration();

      expect(await settingsValueOrNull("listing_defaults")).toBeNull();
    });

    test("strips the retired renewal column from a saved listing column template", async () => {
      await seedOldSchema();
      await execute(
        "INSERT OR REPLACE INTO settings (key, value) VALUES ('listing_column_order', ?)",
        ["{{name}}, {{renewal}}, {{price | money}}, {{ renewal | upcase }}"],
      );

      await runMigration();

      expect(await settingsValueOrNull("listing_column_order")).toBe(
        "{{name}}, {{price | money}}",
      );
    });

    test("drops a column template that held only the renewal column", async () => {
      await seedOldSchema();
      await execute(
        "INSERT OR REPLACE INTO settings (key, value) VALUES ('listing_column_order', '{{renewal}}')",
      );

      await runMigration();

      expect(await settingsValueOrNull("listing_column_order")).toBeNull();
    });
  },
);
