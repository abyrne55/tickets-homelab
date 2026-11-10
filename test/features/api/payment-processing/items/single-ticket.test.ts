/**
 * The paid re-judge for a group that allows one ticket per order: the owner can
 * turn the limit on while a checkout is open, so the signed order is judged
 * against the stored group before any line is charged.
 */

import { expect } from "@std/expect";
import { it as test } from "@std/testing/bdd";
import { assignListingsToGroup } from "#db/groups/membership/package-writes.ts";
import { withMessageGroups } from "#i18n";
import {
  bookingIntent,
  paymentSession,
} from "#test/features/api/payment-processing/index/helpers.ts";
import { validateAllItems } from "#test/features/api/payment-processing/items/helpers.ts";
import { describeWithEnv } from "#test-utils/db.ts";
import { createTestGroup } from "#test-utils/db-helpers/groups.ts";
import { createTestListing } from "#test-utils/db-helpers/listings.ts";
import { setupStripe } from "#test-utils/settings.ts";
import { stubRefundPayment } from "#test-utils/webhooks/stripe.ts";

const dinnerPair = async () => {
  const group = await createTestGroup({
    name: "Dinner",
    singleTicketPerOrder: true,
  });
  const first = await createTestListing({ maxAttendees: 5, unitPrice: 200 });
  const second = await createTestListing({ maxAttendees: 5, unitPrice: 200 });
  await assignListingsToGroup([first.id, second.id], group.id);
  return { first, second };
};

describeWithEnv(
  "paid item validation — one ticket per order",
  { db: true },
  () => {
    test("refunds an order holding two tickets across the group", async () => {
      await setupStripe();
      const { first, second } = await dinnerPair();
      const intent = bookingIntent([
        { e: first.id, p: 200, q: 1 },
        { e: second.id, p: 200, q: 1 },
      ]);
      using _refund = stubRefundPayment("re_single_ticket", 400);

      const result = await withMessageGroups(["payment"], () =>
        validateAllItems(
          paymentSession("cs_single_ticket", 400, intent),
          intent,
        ),
      );
      expect(result).toMatchObject({
        error: "Dinner allows one ticket per order.",
        status: 410,
        success: false,
      });
    });

    test("books an order holding one ticket", async () => {
      await setupStripe();
      const { first } = await dinnerPair();
      const intent = bookingIntent([{ e: first.id, p: 200, q: 1 }]);

      const result = await withMessageGroups(["payment"], () =>
        validateAllItems(
          paymentSession("cs_single_ticket_ok", 200, intent),
          intent,
        ),
      );
      expect(result).toMatchObject({ ok: true });
    });
  },
);
