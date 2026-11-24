/** Schema version label and the migrations bookkeeping table name. */

export const LATEST_UPDATE =
  "Remove the hosting platform: drop built_sites and the site-plan listing columns, and retire the settings of the superuser, self-update, Bunny and custom domain features.";

export const SCHEMA_MIGRATIONS_TABLE = "schema_migrations";
export const LATEST_DB_UPDATE_KEY = "latest_db_update";
export const DB_SCHEMA_HASH_KEY = "db_schema_hash";
export const MIGRATION_LOCK_KEY = "migration_lock";
