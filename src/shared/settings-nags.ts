import { settings } from "#db/settings.ts";
import type { NagItem } from "#types";

/**
 * Returns an ordered list of settings nags for incomplete configuration.
 * Items are returned in the order: payment-provider, business-email.
 * An empty array means there are no pending nags.
 */
export const getSettingsNagItems = (): NagItem[] => {
  const items: NagItem[] = [];

  if (settings.paymentProviderSetting === null) {
    items.push({
      href: "/admin/settings#settings-payment-provider",
      id: "payment-provider",
      label:
        'Choose a payment provider on the settings page (saving "None" is fine).',
    });
  }

  if (settings.businessEmail === "") {
    items.push({
      href: "/admin/settings#settings-business-email",
      id: "business-email",
      label: "Set a business email so users have a contact address.",
    });
  }

  return items;
};
