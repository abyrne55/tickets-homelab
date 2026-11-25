import { schemaMigration } from "./define.ts";

export default schemaMigration(
  "2026-07-18_drop_built_sites_last_pruned",
  "Historical removal of the built-site prune marker.",
  {},
);
