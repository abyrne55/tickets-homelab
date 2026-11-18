/** Schema version label and the migrations bookkeeping table name. */

export const LATEST_UPDATE =
  "Remove the address lookup and logistics: drop their tables, columns and triggers, delete agent users and retire their settings.";

export const SCHEMA_MIGRATIONS_TABLE = "schema_migrations";
export const LATEST_DB_UPDATE_KEY = "latest_db_update";
export const DB_SCHEMA_HASH_KEY = "db_schema_hash";
export const MIGRATION_LOCK_KEY = "migration_lock";
