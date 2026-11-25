import { t } from "#i18n";
import { countedText } from "#shared/count-text.ts";
import type { CheckoutItem } from "#shared/payments.ts";

/** The name and description a provider checkout shows a priced line as: the
 *  listing's name with its count. */
export const providerLineCopy = (
  item: CheckoutItem,
  quantity: number,
): { description: string; name: string } => ({
  description: countedText(t("payment.provider.tickets"), quantity),
  name: t("payment.provider.ticket_name", { name: item.name }),
});
