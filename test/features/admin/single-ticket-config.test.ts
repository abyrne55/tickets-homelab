/**
 * Admin refuses configurations a one-ticket-per-order group could never sell:
 * the flag on a package, the flag over a member that needs two or more tickets,
 * and a listing with a minimum above one joining a flagged group.
 */

import { expect } from "@std/expect";
import { it as test } from "@std/testing/bdd";
import { hmacHash } from "#crypto/hashing.ts";
import { assignListingsToGroup } from "#db/groups/membership/package-writes.ts";
import { groups } from "#db/groups.ts";
import { getListingWithCount } from "#db/listings/records.ts";
import { validateGroupWithPackage } from "#routes/admin/groups.ts";
import { validateListingInput } from "#shared/listings-actions.ts";
import { describeWithEnv } from "#test-utils/db.ts";
import { createTestGroup } from "#test-utils/db-helpers/groups.ts";
import { createTestListing } from "#test-utils/db-helpers/listings.ts";
import { testListingInput } from "#test-utils/factories.ts";

const groupInput = async (
  group: { name: string; slug: string },
  overrides: Record<string, unknown>,
) => ({
  name: group.name,
  slug: group.slug,
  slugIndex: await hmacHash(group.slug),
  ...overrides,
});

describeWithEnv("one ticket per order — admin config", { db: true }, () => {
  test("refuses the flag on a package group", async () => {
    const group = await createTestGroup({ isPackage: true, name: "Bundle" });
    const error = await validateGroupWithPackage(
      await groupInput(group, { isPackage: true, singleTicketPerOrder: true }),
      group.id,
    );
    expect(error).toContain("package");
  });

  test("refuses the flag over a member with a minimum above one", async () => {
    const group = await createTestGroup({ name: "Dinner" });
    const member = await createTestListing({ maxQuantity: 4, name: "Table" });
    const { execute } = await import("#db/client.ts");
    await execute("UPDATE listings SET min_quantity = 2 WHERE id = ?", [
      member.id,
    ]);
    await assignListingsToGroup([member.id], group.id);
    groups.cache.invalidate();
    const error = await validateGroupWithPackage(
      await groupInput(group, { singleTicketPerOrder: true }),
      group.id,
    );
    expect(error).toContain("Table");
    const off = await validateGroupWithPackage(
      await groupInput(group, { singleTicketPerOrder: false }),
      group.id,
    );
    expect(off).toBeNull();
  });

  test("accepts the flag on an ordinary group", async () => {
    const group = await createTestGroup({ name: "Plain dinner" });
    const member = await createTestListing({ name: "Seat" });
    await assignListingsToGroup([member.id], group.id);
    expect(
      await validateGroupWithPackage(
        await groupInput(group, { singleTicketPerOrder: true }),
        group.id,
      ),
    ).toBeNull();
  });

  test("refuses raising a member's minimum above one", async () => {
    const group = await createTestGroup({
      name: "Flagged",
      singleTicketPerOrder: true,
    });
    const member = await createTestListing({ maxQuantity: 4, name: "Seat" });
    await assignListingsToGroup([member.id], group.id);
    groups.cache.invalidate();
    const stored = (await getListingWithCount(member.id))!;
    const input = {
      ...testListingInput({ name: stored.name }),
      groupIds: [group.id],
      maxQuantity: 4,
      minQuantity: 2,
      slug: stored.slug,
      slugIndex: stored.slug_index,
    };
    expect(await validateListingInput(input, member.id)).toContain("Seat");
    expect(
      await validateListingInput({ ...input, minQuantity: 1 }, member.id),
    ).toBeNull();
  });
});
