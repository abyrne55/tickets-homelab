import { expect } from "@std/expect";
import { it as test } from "@std/testing/bdd";
import { settings } from "#db/settings.ts";
import { adminFormPost } from "#test-utils/session.ts";
import {
  activateStripe,
  describeAdminSettings,
  withSuccessfulStripeWebhook,
} from "#test-utils/settings.ts";

describeAdminSettings(() => {
  test("updates credentials without turning sales back on", async () => {
    await activateStripe("whsec_sales_off");
    await settings.update.setPaymentProviderNone();

    await withSuccessfulStripeWebhook(async () => {
      const { response } = await adminFormPost("/admin/settings/stripe", {
        stripe_secret_key: "sk_test_sales_off",
      });
      expect(response.status).toBe(302);
      expect(settings.paymentProvider).toBeNull();
      expect(settings.lastActivePaymentProvider).toBe("stripe");
      expect(settings.stripe.secretKey).toBe("sk_test_sales_off");
    });
  });
});
