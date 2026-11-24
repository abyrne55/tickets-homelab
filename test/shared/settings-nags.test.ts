import { expect } from "@std/expect";
import { it as test } from "@std/testing/bdd";
import { getSettingsNagItems } from "#shared/settings-nags.ts";
import { describeWithEnv } from "#test-utils/db.ts";
import { withSetting } from "#test-utils/settings.ts";

describeWithEnv("getSettingsNagItems", {}, () => {
  test("returns the payment-provider and business-email nags when both are unset", async () => {
    await withSetting(
      { business_email: "", payment_provider_setting: null },
      () => {
        const items = getSettingsNagItems();
        expect(items.map((i) => i.id)).toEqual([
          "payment-provider",
          "business-email",
        ]);
      },
    );
  });

  test("returns empty when all settings are configured", async () => {
    await withSetting(
      { business_email: "a@b.com", payment_provider_setting: "stripe" },
      () => {
        expect(getSettingsNagItems()).toEqual([]);
      },
    );
  });

  test("returns only the payment-provider nag when the provider is unset", async () => {
    await withSetting(
      { business_email: "a@b.com", payment_provider_setting: null },
      () => {
        expect(getSettingsNagItems().map((i) => i.id)).toEqual([
          "payment-provider",
        ]);
      },
    );
  });

  test("returns only the business-email nag when the email is unset", async () => {
    await withSetting(
      { business_email: "", payment_provider_setting: "stripe" },
      () => {
        expect(getSettingsNagItems().map((i) => i.id)).toEqual([
          "business-email",
        ]);
      },
    );
  });

  test('a saved "None" provider counts as chosen', async () => {
    await withSetting(
      { business_email: "a@b.com", payment_provider_setting: "none" },
      () => {
        expect(getSettingsNagItems()).toEqual([]);
      },
    );
  });
});
