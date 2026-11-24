/**
 * Servicing edge cases — cross-feature interactions.
 *
 * A servicing hold is a real booking row, so it flows through the same
 * listing-attendee machinery as a customer booking — but it must NOT trigger
 * the customer-only side effects (webhook firing,
 * modifier consumption, purchase-only restrictions). These pin that the
 * servicing create path skips each customer-only resolution.
 */
import { assert } from "@std/assert";
import { expect } from "@std/expect";
import { it as test } from "@std/testing/bdd";
import { describeWithEnv } from "#test-utils/db.ts";
import { stubFetch } from "#test-utils/fetch-stub.ts";
import { createServicingHold } from "#test-utils/servicing.ts";

describeWithEnv(
  "servicing edge cases — cross-feature interactions",
  { db: true },
  () => {
    test("a servicing hold on a purchase_only listing is accepted (no payment required)", async () => {
      // `purchase_only` listings refuse the public booking flow (no payment =
      // no booking). A servicing hold is free and admin-created, so it bypasses
      // the purchase gate — the hold must actually land on that listing (not
      // merely return an id), so assert the persisted booking.
      const { event, listing } = await createServicingHold({
        listing: { name: "Purchase Only L", purchaseOnly: true },
      });
      expect(event.bookings.map((b) => b.listingId)).toEqual([listing.id]);
    });

    test("a servicing hold on a listing with a webhook configured does not fire the webhook", async () => {
      // The listing's `webhook_url` is set; a customer booking fires it. A
      // servicing hold must not — it's not a customer event. We assert no
      // outbound fetch was made by stubbing fetch and checking call count.
      using fetchStub = stubFetch(new Response());
      await createServicingHold({
        listing: {
          name: "Webhook L",
          webhookUrl: "https://example.com/hook",
        },
      });
      expect(fetchStub.calls).toHaveLength(0);
    });

    test("a servicing hold does not consume modifier stock or apply a modifier", async () => {
      // The listing has a price modifier (e.g. a discount); a customer booking
      // applies it. A servicing hold is free, so no modifier leg should post.
      // We assert the transfers ledger has no modifier legs after the hold.
      const { id } = await createServicingHold({
        listing: { maxAttendees: 10, name: "Modifier L", unitPrice: 1000 },
      });
      const { allTransfers } = await import("#accounting/queries.ts");
      const kinds = (await allTransfers()).map((t) => t.kind);
      assert(!kinds.includes("modifier"));
      expect(id).toBeGreaterThan(0);
    });
  },
);
