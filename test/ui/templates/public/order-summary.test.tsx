import { assert, assertStringIncludes } from "@std/assert";
import { describe, it as test } from "@std/testing/bdd";
import { type PricedOrder, priceCheckout } from "#shared/checkout-pricing.ts";
import type { CheckoutIntent, CheckoutItem } from "#shared/payments.ts";
import { orderSummary } from "#templates/public/order-summary.tsx";

/** Price a purchase the way the checkout pipeline does — through the real
 *  {@link priceCheckout}, so a splitting discount produces the same split
 *  lines the quote renders. */
const pricedOrder = (
  items: CheckoutItem[],
  modifiers: CheckoutIntent["modifiers"] = [],
): PricedOrder =>
  priceCheckout({
    address: "",
    date: null,
    email: "buyer@example.com",
    items,
    modifiers,
    name: "Buyer",
    phone: "",
    special_instructions: "",
  });

describe("order summary rows", () => {
  test("plain ticket lines keep the ×count", () => {
    const html = orderSummary(
      pricedOrder([
        {
          listingId: 2,
          name: "Gala",
          quantity: 2,
          slug: "gala",
          unitPrice: 1000,
        },
      ]),
    );
    assertStringIncludes(html, "2× Gala");
    assert(!html.includes("× months"));
  });
});
