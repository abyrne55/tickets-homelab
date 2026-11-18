import type { Client, Row } from "@libsql/client";
import { decrypt, encrypt } from "#crypto/encryption.ts";
import type { EnvKeyEncrypted } from "#crypto/sealed.ts";
import { schemaMigration } from "./define.ts";

const LOGISTICS_TRIGGERS = [
  "trg_admin_feature_logistics_agents_insert",
  "trg_admin_feature_logistics_agents_update",
  "trg_admin_feature_logistics_listings_insert",
  "trg_admin_feature_logistics_listings_update",
];

const RETIRED_TABLES = [
  "logistics_agents",
  "user_logistics_agents",
  "address_cache",
];

/** Settings only the removed address lookup and logistics features wrote. */
const RETIRED_SETTING_KEYS = [
  "address_lookup_api_key",
  "address_lookup_provider",
  "logistics_run_sheet_body",
  "logistics_run_sheet_heading",
  "has_logistics",
];

/** Tables rebuilt from SCHEMA to shed the retired logistics columns:
 * listings.uses_logistics, attendees.split_logistics_agents and the agent,
 * time and done columns on listing_attendees. */
const REBUILT_TABLES = ["listings", "attendees", "listing_attendees"];

// The raw decrypt, not decryptAdminLevel: "agent" is no longer an admin level,
// so that helper would throw on it.
const isAgentUser = async (row: Row): Promise<boolean> =>
  (await decrypt(row.admin_level as EnvKeyEncrypted)) === "agent";

/** The agent role is gone, so the users holding it go too, with the sessions
 * and API keys that would otherwise outlive them. */
const deleteAgentUsers = async (db: Client): Promise<void> => {
  const users = await db.execute("SELECT id, admin_level FROM users");
  const agentIds: number[] = [];
  for (const row of users.rows) {
    if (await isAgentUser(row)) agentIds.push(Number(row.id));
  }
  if (agentIds.length === 0) return;
  await db.batch(
    ["api_keys", "sessions"]
      .map((table) => ({
        args: agentIds,
        sql: `DELETE FROM ${table} WHERE user_id IN (${agentIds.map(() => "?").join(", ")})`,
      }))
      .concat({
        args: agentIds,
        sql: `DELETE FROM users WHERE id IN (${agentIds.map(() => "?").join(", ")})`,
      }),
  );
};

/** Drop the `usesLogistics` key from the stored listing defaults. The value is
 * encrypted and the schema no longer knows the key, so it is edited as plain
 * JSON rather than parsed. */
const dropLogisticsListingDefault = async (db: Client): Promise<void> => {
  const result = await db.execute(
    "SELECT value FROM settings WHERE key = 'listing_defaults'",
  );
  const stored = result.rows[0]?.value;
  if (typeof stored !== "string" || stored === "") return;
  const defaults = JSON.parse(
    await decrypt(stored as EnvKeyEncrypted),
  ) as Record<string, unknown>;
  if (!("usesLogistics" in defaults)) return;
  delete defaults.usesLogistics;
  await db.execute({
    args: [await encrypt(JSON.stringify(defaults))],
    sql: "UPDATE settings SET value = ? WHERE key = 'listing_defaults'",
  });
};

export default schemaMigration(
  "2026-11-18_remove_address_lookup_and_logistics",
  "Remove the address lookup and logistics: drop their tables, columns and triggers, delete agent users and retire their settings.",
  { absentTables: RETIRED_TABLES },
  async ({ getDb, recreateTable, syncIndexes, syncTriggers }) => {
    const db = getDb();
    // The triggers read the columns and table about to go, so they leave first.
    for (const trigger of LOGISTICS_TRIGGERS) {
      await db.execute(`DROP TRIGGER IF EXISTS ${trigger}`);
    }
    for (const table of REBUILT_TABLES) await recreateTable(table);
    await syncIndexes();
    await syncTriggers();
    for (const table of RETIRED_TABLES) {
      await db.execute(`DROP TABLE IF EXISTS ${table}`);
    }
    await deleteAgentUsers(db);
    await db.execute(
      "UPDATE settings SET value = json_remove(value, '$.logistics') WHERE key = 'enabled_features' AND json_valid(value)",
    );
    await db.execute({
      args: RETIRED_SETTING_KEYS,
      sql: `DELETE FROM settings WHERE key IN (${RETIRED_SETTING_KEYS.map(() => "?").join(", ")})`,
    });
    await dropLogisticsListingDefault(db);
  },
);
