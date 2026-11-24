import { expect } from "@std/expect";
import { describe, it as test } from "@std/testing/bdd";
import { providerLineCopy } from "#payment/provider-line-copy.ts";
import { checkoutItem } from "#test-utils/checkout-items.ts";

describe("providerLineCopy", () => {
  test("keeps ticket wording for ordinary lines", () => {
    expect(providerLineCopy(checkoutItem({ name: "Gala" }), 1)).toEqual({
      description: "Tickets (x1)",
      name: "Ticket: Gala",
    });
    expect(providerLineCopy(checkoutItem({ name: "Gala" }), 3)).toEqual({
      description: "Tickets (x3)",
      name: "Ticket: Gala",
    });
  });
});
