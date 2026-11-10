import { schemaMigration } from "./define.ts";

/**
 * Add `single_ticket_per_order` to groups so a group can cap every public
 * order at one ticket across its member listings. Default 0 ⇒ nothing changes
 * for existing groups.
 */
export default schemaMigration(
  "2026-11-10_group_single_ticket_per_order",
  "Add single_ticket_per_order column to groups so a group can limit each order to one ticket.",
  {
    columns: { groups: ["single_ticket_per_order"] },
  },
);
