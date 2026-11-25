import { expect } from "@std/expect";
import { it as test } from "@std/testing/bdd";
import { withTransaction } from "#db/client.ts";
import { requireTouchingRelationshipsTx } from "#db/listing-relationship-validation.ts";
import { t } from "#i18n";
import { describeWithEnv } from "#test-utils/db.ts";
import { createTestListing } from "#test-utils/db-helpers/listings.ts";
import { standardParentWithDailyChildEdge } from "#test-utils/listing-parents/helpers.ts";

const check = (listingId: number): Promise<void> =>
  withTransaction((tx) => requireTouchingRelationshipsTx(tx, listingId));

describeWithEnv(
  "db > listing-parents > touching relationship checks",
  { db: true },
  () => {
    test("checks incoming parent edges", async () => {
      const { child } = await standardParentWithDailyChildEdge();

      await expect(check(child.id)).rejects.toThrow(
        t("listings_table.children_err_child_daily", { name: child.name }),
      );
    });

    test("accepts a listing without edges", async () => {
      const listing = await createTestListing({ name: "Standalone listing" });

      await expect(check(listing.id)).resolves.toBeUndefined();
    });
  },
);
