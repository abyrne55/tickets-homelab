import { assertStringIncludes } from "@std/assert";
import { expect } from "@std/expect";
import { it as test } from "@std/testing/bdd";
import { ALL_SETTINGS_KEYS, CONFIG_KEYS, settings } from "#db/settings.ts";
import { hasCheckedInput, inputTagWithValue } from "#test-utils/csrf.ts";
import { describeWithEnv } from "#test-utils/db.ts";
import { adminGet } from "#test-utils/session.ts";
import { setupStripe } from "#test-utils/settings.ts";

describeWithEnv(
  "settings-advanced state carries lastActivePaymentProvider",
  { db: true },
  () => {
    test("requires a provider choice when stored credentials are ambiguous", async () => {
      await setupStripe();
      await settings.update.square.accessToken("square-recovery-token");
      await settings.update.setPaymentProviderNone();
      await settings.setRaw(CONFIG_KEYS.LAST_ACTIVE_PAYMENT_PROVIDER, "");
      settings.invalidateCache();
      await settings.loadKeys(ALL_SETTINGS_KEYS);

      const html = await (await adminGet("/admin/settings")).text();
      const form = html.match(
        /<form[^>]*action="\/admin\/settings\/payment-provider-recovery"[^>]*>[\s\S]*?<\/form>/,
      );
      expect(form).not.toBeNull();
      if (form === null) return;
      assertStringIncludes(form[0], 'id="settings-payment-provider-recovery"');
      for (const provider of ["stripe", "square"]) {
        const input = inputTagWithValue(
          form[0],
          provider,
          "existing_payment_provider",
        );
        assertStringIncludes(input, "required");
      }
      expect(hasCheckedInput(html, "payment_provider", "none")).toBe(true);
    });
  },
);
