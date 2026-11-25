import { expect } from "@std/expect";
import { it as test } from "@std/testing/bdd";
import { SettingsNagBanner } from "#templates/admin/settings-nag-banner.tsx";
import { expectIncludesAll } from "#test-utils/assertions.ts";
import { describeWithEnv } from "#test-utils/db.ts";
import { withSetting } from "#test-utils/settings.ts";

describeWithEnv("SettingsNagBanner", {}, () => {
  test("SettingsNagBanner() with no args renders base sync nags", async () => {
    await withSetting(
      { business_email: "", payment_provider_setting: null },
      () => {
        const html = String(SettingsNagBanner());
        expectIncludesAll(html, [
          "Finish setting up your site",
          'href="/admin/settings#settings-payment-provider"',
          'href="/admin/settings#settings-business-email"',
        ]);
      },
    );
  });

  test("SettingsNagBanner({ items: undefined }) also falls back to base nags", async () => {
    await withSetting(
      { business_email: "", payment_provider_setting: null },
      () => {
        const html = String(SettingsNagBanner({}));
        expectIncludesAll(html, [
          "Finish setting up your site",
          'href="/admin/settings#settings-payment-provider"',
        ]);
      },
    );
  });

  test("renders nothing (null) when items array is empty", () => {
    const result = SettingsNagBanner({ items: [] });
    expect(result).toBeNull();
  });
});
