import type { Client } from "@libsql/client";
import { decrypt, encrypt } from "#crypto/encryption.ts";
import type { EnvKeyEncrypted } from "#crypto/sealed.ts";
import { schemaMigration } from "./define.ts";

/** Settings only the removed hosting platform wrote: the superuser and
 * support form, the self-update version markers, Bunny fonts, and the custom
 * domain and subdomain. */
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

/** The listing-defaults keys that belonged to site plans. */
const RETIRED_LISTING_DEFAULT_KEYS = [
  "assignBuiltSite",
  "monthsPerUnit",
  "initialSiteMonths",
];

/** Drop the retired site-plan keys from the stored listing defaults. The value
 * is encrypted and the schema no longer knows the keys, so it is edited as
 * plain JSON rather than parsed. */
const dropSitePlanListingDefaults = async (db: Client): Promise<void> => {
  const result = await db.execute(
    "SELECT value FROM settings WHERE key = 'listing_defaults'",
  );
  const stored = result.rows[0]?.value;
  if (typeof stored !== "string" || stored === "") return;
  const defaults = JSON.parse(
    await decrypt(stored as EnvKeyEncrypted),
  ) as Record<string, unknown>;
  const present = RETIRED_LISTING_DEFAULT_KEYS.filter((key) => key in defaults);
  if (present.length === 0) return;
  for (const key of present) delete defaults[key];
  await db.execute({
    args: [await encrypt(JSON.stringify(defaults))],
    sql: "UPDATE settings SET value = ? WHERE key = 'listing_defaults'",
  });
};

/** The {{renewal}} column is gone, and a saved listing column template that
 * names an unknown column fails to parse. Strip its tags, with any filter, and
 * drop the template when nothing is left so the default layout applies. */
const dropRenewalListingColumn = async (db: Client): Promise<void> => {
  const result = await db.execute(
    "SELECT value FROM settings WHERE key = 'listing_column_order'",
  );
  const stored = result.rows[0]?.value;
  if (typeof stored !== "string" || stored === "") return;
  const kept = stored
    .replace(/\{\{\s*renewal\s*(?:\|[^}]*)?\}\}/g, "")
    .replace(/^[\s,]+|[\s,]+$/g, "")
    .replace(/\s*,(?:\s*,)+/g, ",");
  if (kept === stored) return;
  await (kept.includes("{{")
    ? db.execute({
        args: [kept],
        sql: "UPDATE settings SET value = ? WHERE key = 'listing_column_order'",
      })
    : db.execute("DELETE FROM settings WHERE key = 'listing_column_order'"));
};

export default schemaMigration(
  "2026-11-24_remove_hosting_platform",
  "Remove the hosting platform: drop built_sites and the site-plan listing columns, and retire the settings of the superuser, self-update, Bunny and custom domain features.",
  { absentTables: ["built_sites"] },
  async ({ getDb, recreateTable, syncIndexes, syncTriggers }) => {
    const db = getDb();
    await recreateTable("listings");
    await syncIndexes();
    await syncTriggers();
    await db.execute("DROP TABLE IF EXISTS built_sites");
    await db.execute({
      args: RETIRED_SETTING_KEYS,
      sql: `DELETE FROM settings WHERE key IN (${RETIRED_SETTING_KEYS.map(() => "?").join(", ")})`,
    });
    await dropSitePlanListingDefaults(db);
    await dropRenewalListingColumn(db);
  },
);
