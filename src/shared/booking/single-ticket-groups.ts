// effects: pure
import { t } from "#i18n";

/** The shared radio name on a one-ticket-per-order group page. */
export const SINGLE_TICKET_FIELD = "single_ticket";

/** A group with "one ticket per order" on, and which of the order's listings
 * belong to it. */
export type FlaggedGroup = {
  id: number;
  listingIds: readonly number[];
  name: string;
};

/**
 * The refusal for the first flagged group whose members sum to more than one
 * ticket in this order, or null when every flagged group is within its limit.
 * The sum spans all of the group's member listings, whichever page or cart the
 * order came from. A group with no ticket in the order is never refused.
 */
export const singleTicketRefusal = (
  quantitiesByListingId: ReadonlyMap<number, number>,
  flaggedGroups: readonly FlaggedGroup[],
): string | null => {
  for (const group of flaggedGroups) {
    let total = 0;
    for (const listingId of group.listingIds) {
      total += quantitiesByListingId.get(listingId) ?? 0;
    }
    if (total > 1) {
      return t("payment.failure.single_ticket_per_order", { name: group.name });
    }
  }
  return null;
};

/** The refusal for a listing that sells at least two tickets per purchase
 * joining (or staying in) a one-ticket-per-order group, or null. */
export const singleTicketMemberError = (listing: {
  min_quantity: number;
  name: string;
}): string | null =>
  listing.min_quantity > 1
    ? t("error.single_ticket_member_min", {
        min_quantity: listing.min_quantity,
        name: listing.name,
      })
    : null;

/** The refusal for turning one-ticket-per-order on for a group: packages book
 * several listings together, and a member with a minimum above one could never
 * be booked. Null when the flag is fine. */
export const singleTicketGroupError = (
  isPackage: boolean,
  members: readonly { min_quantity: number; name: string }[],
): string | null =>
  isPackage
    ? t("error.single_ticket_package")
    : (members.map(singleTicketMemberError).find((e) => e !== null) ?? null);
