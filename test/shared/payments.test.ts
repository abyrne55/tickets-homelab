import { expect } from "@std/expect";
import { describe, it as test } from "@std/testing/bdd";
import { stub } from "@std/testing/mock";
import { setSuppressDebugLogs } from "#shared/log-settings.ts";
import {
  checkoutItem,
  getActivePaymentProvider,
  getPaymentProviderForExistingPayments,
  paymentsApi,
} from "#shared/payments.ts";
import { describeWithEnv } from "#test-utils/db.ts";
import { testListing } from "#test-utils/factories.ts";
import { setupStripe } from "#test-utils/settings.ts";

describe("checkoutItem terms", () => {
  test("keeps an ordinary listing a ticket line", () => {
    const listing = testListing({ name: "Gala", slug: "gala" });
    expect(checkoutItem(listing, 3, 1000)).toEqual({
      listingId: listing.id,
      name: "Gala",
      quantity: 3,
      slug: "gala",
      unitPrice: 1000,
    });
  });
});

describeWithEnv("provider resolution labels", { db: true }, () => {
  test("resolves no provider when settings configure none", async () => {
    const missing = stub(paymentsApi, "getConfiguredProvider", () => null);
    const noneConfigured: string[] = [];
    const debug = stub(console, "debug", (line: unknown) => {
      const text = String(line);
      if (text.includes("No payment provider configured in settings")) {
        noneConfigured.push(text);
      }
    });
    setSuppressDebugLogs(false);
    try {
      await expect(getActivePaymentProvider()).resolves.toBeNull();
      await expect(getPaymentProviderForExistingPayments()).resolves.toBeNull();
      // The active route — and only that route — names the missing provider:
      // an existing-payment lookup resolves first and stays silent.
      expect(noneConfigured).toHaveLength(1);
    } finally {
      missing.restore();
      debug.restore();
      setSuppressDebugLogs(null);
    }
  });

  test("logs each lookup under its own route's words", async () => {
    await setupStripe();
    const logged: string[] = [];
    const debug = stub(console, "debug", (line: unknown) => {
      logged.push(String(line));
    });
    setSuppressDebugLogs(false);
    try {
      await getActivePaymentProvider();
      await getPaymentProviderForExistingPayments();
      expect(
        logged.some((line) =>
          line.includes("[Payment] Resolving payment provider: stripe"),
        ),
      ).toBe(true);
      expect(
        logged.some((line) =>
          line.includes(
            "[Payment] Resolving payment provider for existing payments: stripe",
          ),
        ),
      ).toBe(true);
    } finally {
      debug.restore();
      setSuppressDebugLogs(null);
    }
  });
});
