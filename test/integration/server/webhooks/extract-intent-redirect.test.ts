import { expect } from "@std/expect";
import { it as test } from "@std/testing/bdd";
import { stub } from "@std/testing/mock";
import { getAttendeesRaw } from "#db/attendees/queries.ts";
import { handleRequest } from "#routes";
import { stripeApi } from "#shared/stripe.ts";
import { followRedirect } from "#test-utils/assertions.ts";
import { describeWithEnv } from "#test-utils/db.ts";
import { createTestListing } from "#test-utils/db-helpers/listings.ts";
import { singleItem } from "#test-utils/factories.ts";
import { mockRequest } from "#test-utils/mocks.ts";
import { setupStripe } from "#test-utils/settings.ts";
import { stubCheckoutSession } from "#test-utils/stripe/responses.ts";
import { stubRetrieveCheckoutSession } from "#test-utils/webhooks/stripe.ts";

describeWithEnv(
  "server webhooks > extractIntent + redirect/renewal",
  { db: true },
  () => {
    test("extractIntent rejects missing items in metadata", async () => {
      await setupStripe();

      const mockRetrieve = stub(stripeApi, "retrieveCheckoutSession", () =>
        Promise.resolve(
          stubCheckoutSession({
            amount_total: 1000,
            currency: "gbp",
            id: "cs_no_items",
            metadata: {
              email: "john@example.com",
              name: "John",
              // items intentionally omitted — should cause an error
            },
            payment_intent: "pi_no_items",
            payment_status: "paid",
          }),
        ),
      );

      try {
        const redirectResponse = await handleRequest(
          mockRequest("/payment/success?session_id=cs_no_items"),
        );
        // extractIntent catches error and returns 400
        expect(redirectResponse.status).toBe(400);
      } finally {
        mockRetrieve.restore();
      }
    });

    test("extractIntent preserves quantity 0 from metadata", async () => {
      await setupStripe();

      const listing = await createTestListing({
        maxAttendees: 50,
        unitPrice: 1000,
      });

      const mockRetrieve = stubRetrieveCheckoutSession({
        amountTotal: 0,
        email: "john@example.com",
        items: singleItem(listing.id, 0, 0),
        name: "John",
        paymentIntent: "pi_qty_zero",
        sessionId: "cs_qty_zero",
      });

      try {
        const redirectResponse = await handleRequest(
          mockRequest("/payment/success?session_id=cs_qty_zero"),
        );
        expect(redirectResponse.status).toBe(302);
        // The booking is created from metadata without coercing 0→1, but the
        // success page treats a token resolving only to quantity-0 lines as an
        // invalid callback (a quantity-0 line has no live ticket).
        const response = await followRedirect(redirectResponse, handleRequest);
        expect(response.status).toBe(400);

        // Verify attendee was created with quantity 0, not silently converted to 1
        const attendees = await getAttendeesRaw(listing.id);
        expect(attendees.length).toBe(1);
        expect(attendees[0]?.quantity).toBe(0);
      } finally {
        mockRetrieve.restore();
      }
    });

    test("payment success reads orderId param for Square redirect", async () => {
      await setupStripe();

      const listing = await createTestListing({
        maxAttendees: 50,
        unitPrice: 1000,
      });

      const mockRetrieve = stubRetrieveCheckoutSession({
        amountTotal: 1000,
        email: "square@example.com",
        items: singleItem(listing.id, 1, 1000),
        name: "Square User",
        paymentIntent: "pi_square_order",
        sessionId: "cs_square_order",
      });

      try {
        // Square appends orderId as a query parameter (not session_id)
        const redirectResponse = await handleRequest(
          mockRequest("/payment/success?orderId=cs_square_order"),
        );
        expect(redirectResponse.status).toBe(302);
        const response = await followRedirect(redirectResponse, handleRequest);
        expect(response.status).toBe(200);
      } finally {
        mockRetrieve.restore();
      }
    });
  },
);
