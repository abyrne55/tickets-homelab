import { expect } from "@std/expect";
import { it as test } from "@std/testing/bdd";
import { decrypt, encrypt } from "#crypto/encryption.ts";
import type { EnvKeyEncrypted } from "#crypto/sealed.ts";
import { getDb, queryOne } from "#db/client.ts";
import removeAddressLookupAndLogisticsMigration from "#db/migrations/2026-11-18_remove_address_lookup_and_logistics.ts";
import {
  recreateTable,
  syncIndexes,
  syncTriggers,
} from "#db/migrations/schema-sync.ts";
import { createSession } from "#db/sessions.ts";
import { createInvitedUser } from "#db/users.ts";
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
  removeAddressLookupAndLogisticsMigration(context).up();

const LOGISTICS_TRIGGERS = [
  "trg_admin_feature_logistics_agents_insert",
  "trg_admin_feature_logistics_agents_update",
  "trg_admin_feature_logistics_listings_insert",
  "trg_admin_feature_logistics_listings_update",
];

const execute = (sql: string, args: (string | number)[] = []) =>
  getDb().execute({ args, sql });

const columnNames = async (table: string): Promise<string[]> =>
  (await execute(`PRAGMA table_info(${table})`)).rows.map((row) =>
    String(row.name),
  );

const objectExists = async (type: string, name: string): Promise<boolean> =>
  (
    await execute("SELECT 1 FROM sqlite_master WHERE type = ? AND name = ?", [
      type,
      name,
    ])
  ).rows.length > 0;

/** The schema as the release before this one left it: the three retired
 * tables, the retired columns and the four logistics triggers. */
const seedOldSchema = async (): Promise<void> => {
  await execute(
    "CREATE TABLE logistics_agents (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL)",
  );
  await execute(
    "CREATE TABLE user_logistics_agents (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, agent_id INTEGER NOT NULL)",
  );
  await execute(
    "CREATE TABLE address_cache (id INTEGER PRIMARY KEY AUTOINCREMENT, search_index TEXT NOT NULL, results TEXT NOT NULL, created TEXT NOT NULL)",
  );
  await execute(
    "ALTER TABLE listings ADD COLUMN uses_logistics INTEGER NOT NULL DEFAULT 0",
  );
  await execute(
    "ALTER TABLE attendees ADD COLUMN split_logistics_agents INTEGER NOT NULL DEFAULT 0",
  );
  for (const column of [
    "start_agent_id INTEGER",
    "end_agent_id INTEGER",
    "start_time TEXT NOT NULL DEFAULT ''",
    "end_time TEXT NOT NULL DEFAULT ''",
    "start_done INTEGER NOT NULL DEFAULT 0",
    "end_done INTEGER NOT NULL DEFAULT 0",
  ]) {
    await execute(`ALTER TABLE listing_attendees ADD COLUMN ${column}`);
  }
  await execute(
    "CREATE TRIGGER trg_admin_feature_logistics_agents_insert AFTER INSERT ON logistics_agents BEGIN SELECT 1; END",
  );
  await execute(
    "CREATE TRIGGER trg_admin_feature_logistics_agents_update AFTER UPDATE OF name ON logistics_agents BEGIN SELECT 1; END",
  );
  await execute(
    "CREATE TRIGGER trg_admin_feature_logistics_listings_insert AFTER INSERT ON listings WHEN NEW.uses_logistics = 1 BEGIN SELECT 1; END",
  );
  await execute(
    "CREATE TRIGGER trg_admin_feature_logistics_listings_update AFTER UPDATE OF uses_logistics ON listings WHEN NEW.uses_logistics = 1 BEGIN SELECT 1; END",
  );
};

/** A user with a session and an API key, at the given (raw) admin level. */
const seedUser = async (
  username: string,
  adminLevel: string,
): Promise<number> => {
  const user = await createInvitedUser(
    username,
    "manager",
    `${username}-invite`,
    "2099-01-01T00:00:00.000Z",
  );
  await execute("UPDATE users SET admin_level = ? WHERE id = ?", [
    await encrypt(adminLevel),
    user.id,
  ]);
  await createSession(
    `${username}-session`,
    `${username}-csrf`,
    Date.now() + 60_000,
    null,
    user.id,
  );
  await execute(
    "INSERT INTO api_keys (created, key_index, last_used, name, user_id, wrapped_data_key) VALUES ('2026-07-19T00:00:00.000Z', ?, '', ?, ?, 'wrapped')",
    [`${username}-key`, await encrypt(`${username} key`), user.id],
  );
  return user.id;
};

const countWhere = async (table: string, userId: number): Promise<number> =>
  Number(
    (
      await queryOne<{ n: number }>(
        `SELECT COUNT(*) AS n FROM ${table} WHERE ${table === "users" ? "id" : "user_id"} = ?`,
        [userId],
      )
    )?.n,
  );

describeWithEnv(
  "db > migrations > 2026-11-18_remove_address_lookup_and_logistics",
  { db: true },
  () => {
    test("declares its id, description and absent tables", () => {
      const migration = removeAddressLookupAndLogisticsMigration(context);
      expect(migration.id).toBe(
        "2026-11-18_remove_address_lookup_and_logistics",
      );
      expect(migration.description).toBe(
        "Remove the address lookup and logistics: drop their tables, columns and triggers, delete agent users and retire their settings.",
      );
      expect(migration.requires?.absentTables).toEqual([
        "logistics_agents",
        "user_logistics_agents",
        "address_cache",
      ]);
    });

    test("drops the retired tables, columns and triggers", async () => {
      await seedOldSchema();
      await execute("INSERT INTO logistics_agents (name) VALUES ('Van')");
      await execute(
        "INSERT INTO address_cache (search_index, results, created) VALUES ('i', 'r', '2026-01-01')",
      );

      await runMigration();

      for (const table of RETIRED_TABLES) {
        expect(await tableExists(table)).toBe(false);
      }
      expect(await columnNames("listings")).not.toContain("uses_logistics");
      expect(await columnNames("attendees")).not.toContain(
        "split_logistics_agents",
      );
      const bookingColumns = await columnNames("listing_attendees");
      for (const column of [
        "start_agent_id",
        "end_agent_id",
        "start_time",
        "end_time",
        "start_done",
        "end_done",
      ]) {
        expect(bookingColumns).not.toContain(column);
      }
      for (const trigger of LOGISTICS_TRIGGERS) {
        expect(await objectExists("trigger", trigger)).toBe(false);
      }
    });

    test("keeps listings, attendees and bookings and their indexes", async () => {
      await seedOldSchema();
      await execute(
        "INSERT INTO listings (id, created, max_attendees, name, slug, slug_index, uses_logistics) VALUES (1, '2026-01-01', 10, 'Kept listing', 'kept', 'kept-index', 1)",
      );
      await execute(
        "INSERT INTO attendees (id, created, pii_blob, split_logistics_agents) VALUES (2, '2026-01-02', 'blob', 1)",
      );
      await execute(
        "INSERT INTO listing_attendees (id, listing_id, attendee_id, start_at, end_at, quantity, start_agent_id, start_time, start_done) VALUES (3, 1, 2, '2026-02-01T00:00:00Z', '2026-02-02T00:00:00Z', 4, 9, '09:00', 1)",
      );

      await runMigration();

      expect(
        await queryOne("SELECT name, max_attendees FROM listings WHERE id = 1"),
      ).toEqual({ max_attendees: 10, name: "Kept listing" });
      expect(
        await queryOne("SELECT pii_blob FROM attendees WHERE id = 2"),
      ).toEqual({ pii_blob: "blob" });
      expect(
        await queryOne(
          "SELECT quantity, start_at FROM listing_attendees WHERE id = 3",
        ),
      ).toEqual({ quantity: 4, start_at: "2026-02-01T00:00:00Z" });
      // The calendar's day view still has its cross-listing index.
      expect(
        await objectExists("index", "idx_listing_attendees_end_start"),
      ).toBe(true);
    });

    test("deletes agent users with their sessions and API keys, and no one else", async () => {
      await seedOldSchema();
      const agentId = await seedUser("an-agent", "agent");
      const managerId = await seedUser("a-manager", "manager");
      const ownerId = await seedUser("an-owner", "owner");

      await runMigration();

      for (const table of ["users", "sessions", "api_keys"]) {
        expect(await countWhere(table, agentId)).toBe(0);
        expect(await countWhere(table, managerId)).toBe(1);
        expect(await countWhere(table, ownerId)).toBe(1);
      }
    });

    test("removes the logistics feature flag and keeps the others", async () => {
      await seedOldSchema();
      await execute(
        "INSERT OR REPLACE INTO settings (key, value) VALUES ('enabled_features', ?)",
        ['{"logistics":true,"money":true,"site":false}'],
      );

      await runMigration();

      expect(
        JSON.parse((await settingsValueOrNull("enabled_features"))!),
      ).toEqual({ money: true, site: false });
    });

    test("leaves an absent enabled-features setting absent", async () => {
      await seedOldSchema();
      await execute("DELETE FROM settings WHERE key = 'enabled_features'");

      await runMigration();

      expect(await settingsValueOrNull("enabled_features")).toBeNull();
    });

    test("deletes the retired settings and keeps unrelated ones", async () => {
      await seedOldSchema();
      for (const key of [
        "address_lookup_api_key",
        "address_lookup_provider",
        "logistics_run_sheet_body",
        "logistics_run_sheet_heading",
        "has_logistics",
        "business_email",
      ]) {
        await execute(
          "INSERT OR REPLACE INTO settings (key, value) VALUES (?, 'x')",
          [key],
        );
      }

      await runMigration();

      for (const key of [
        "address_lookup_api_key",
        "address_lookup_provider",
        "logistics_run_sheet_body",
        "logistics_run_sheet_heading",
        "has_logistics",
      ]) {
        expect(await settingsValueOrNull(key)).toBeNull();
      }
      expect(await settingsValueOrNull("business_email")).toBe("x");
    });

    test("drops usesLogistics from the stored listing defaults and keeps the rest", async () => {
      await seedOldSchema();
      await execute(
        "INSERT OR REPLACE INTO settings (key, value) VALUES ('listing_defaults', ?)",
        [await encrypt('{"hidden":true,"usesLogistics":true}')],
      );

      await runMigration();

      const stored = (await settingsValueOrNull("listing_defaults"))!;
      expect(stored).toMatch(/^enc:1:/);
      expect(JSON.parse(await decrypt(stored as EnvKeyEncrypted))).toEqual({
        hidden: true,
      });
    });

    test("leaves listing defaults without the key untouched", async () => {
      await seedOldSchema();
      const original = await encrypt('{"hidden":true}');
      await execute(
        "INSERT OR REPLACE INTO settings (key, value) VALUES ('listing_defaults', ?)",
        [original],
      );

      await runMigration();

      expect(await settingsValueOrNull("listing_defaults")).toBe(original);
    });

    test("skips listing defaults that were never set", async () => {
      await seedOldSchema();
      await execute("DELETE FROM settings WHERE key = 'listing_defaults'");

      await runMigration();

      expect(await settingsValueOrNull("listing_defaults")).toBeNull();
    });

    test("is safe to run again", async () => {
      await seedOldSchema();
      await seedUser("an-agent", "agent");

      await runMigration();
      await runMigration();

      for (const table of RETIRED_TABLES) {
        expect(await tableExists(table)).toBe(false);
      }
    });
  },
);

const RETIRED_TABLES = [
  "logistics_agents",
  "user_logistics_agents",
  "address_cache",
];
