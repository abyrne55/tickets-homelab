/**
 * Webhook notification module
 * Sends consolidated registration data to configured webhook URLs
 */

import {
  effectivePrice,
  NO_CUSTOM_PRICES,
  packageMemberPriceRule,
} from "#booking/price-tree.ts";
import type { WebhookBookingSource } from "#db/contact-tokens.ts";
import { settings } from "#db/settings.ts";
import { sumOf } from "#fp";
import { bookedSpanDays } from "#shared/dates.ts";
import { nowIso } from "#shared/now.ts";
import type { RegistrationPackagePricing } from "#shared/registration-package-facts.ts";
import { buildTicketUrl } from "#shared/ticket-url.ts";
import { type ContactInfo, type DayPrices, isPaidListing } from "#types";

/** Single ticket in the webhook payload */
export type WebhookTicket = {
  listing_name: string;
  listing_slug: string;
  unit_price: number;
  quantity: number;
  date: string | null;
  ticket_token: string;
};

/** Consolidated payload sent to webhook endpoints */
export type WebhookPayload = ContactInfo & {
  notification_type: "registration.completed";
  /** How the booking was made. "public" is a booking the person made online
   * (checkout, reservation, or API). "admin" is a booking an admin added by
   * hand. "unknown" means no stored contact history holds the answer. */
  source: WebhookBookingSource;
  price_paid: number | null;
  /** Outstanding order balance still owed, in minor units. 0 when fully paid;
   * positive when a booking was taken without collecting payment (e.g. no
   * payment provider is configured), so integrations see the amount to collect. */
  amount_owed: number;
  currency: string;
  payment_id: string | null;
  ticket_url: string;
  tickets: WebhookTicket[];
  timestamp: string;
  business_email: string;
};

/** Listing data needed for webhook notifications */
export type WebhookListing = {
  id: number;
  name: string;
  slug: string;
  webhook_url: string;
  max_attendees: number;
  attendee_count: number;
  unit_price: number;
  can_pay_more: boolean;
  customisable_days: boolean;
  day_prices: DayPrices;
  /** Maximum day count for a customisable listing — the bound the shared price
   * evaluation validates a booked span against. */
  duration_days: number;
};

/** Attendee data needed for webhook notifications */
export type WebhookAttendee = ContactInfo & {
  id: number;
  quantity: number;
  payment_id: string;
  price_paid: string;
  /** Order-level outstanding balance in minor units; 0 when fully paid. Shared
   * across every booking on the order (it is an attendee-level figure). */
  remaining_balance: number;
  ticket_token: string;
  date: string | null;
  /** Exclusive end of the booked range (YYYY-MM-DD), or null for date-less
   * bookings. Used to render the true span of multi-day/customisable bookings. */
  end_date: string | null;
  /** The package group this booking belongs to (0 = not a package). Lets the
   * confirmation email group the order's lines under the package by this
   * persisted id rather than membership equality. */
  package_group_id: number;
  /** Whether this booking row's payment was refunded. */
  refunded: boolean;
};

/** Registration entry: listing + attendee pair */
export type RegistrationEntry = {
  listing: WebhookListing;
  attendee: WebhookAttendee;
};

/** One package group's pricing for the payload: each member's flat override (a
 * positive amount or an explicit free `0`; members with no override are absent)
 * and each customisable member's per-day overrides (day count → minor units) —
 * the loader's shape, minus the fields the payload never reads. */
type PackagePricingByGroup = ReadonlyMap<number, RegistrationPackagePricing>;

/** The full per-unit price for a booking line: the shared checkout evaluation
 * ({@link packageMemberPriceRule} + {@link effectivePrice}) over the span
 * actually booked (derived from the stored range) — NOT the amount collected: a
 * discounted/deposit/free-provider order pays less now than the ticket is
 * worth, and dividing the paid-now amount would under-report it. A package
 * member reports its flat override (its base `unit_price` is 0 — the charge
 * lives in the override), else its per-day override, else — like any
 * customisable line, package or standalone — the listing's own entered day
 * price for the booked span; everything else reports the listing's base. */
const ticketUnitPrice = (
  entry: RegistrationEntry,
  pricingByGroup: PackagePricingByGroup,
): number => {
  const { listing, attendee } = entry;
  const groupPricing =
    attendee.package_group_id > 0
      ? pricingByGroup.get(attendee.package_group_id)
      : undefined;
  const rule = packageMemberPriceRule(
    groupPricing?.priceMap.get(listing.id),
    groupPricing?.dayPriceMap.get(listing.id),
    listing.customisable_days,
  );
  return effectivePrice(
    rule,
    listing,
    NO_CUSTOM_PRICES,
    bookedSpanDays(attendee.date, attendee.end_date),
  );
};

/**
 * Build a consolidated webhook payload from registration entries. `source` is
 * required: a new booking path states its stored source, and a re-send of a
 * booking with no contact history states "unknown".
 */
export const buildWebhookPayload = (
  entries: RegistrationEntry[],
  currency: string,
  source: WebhookBookingSource,
  pricingByGroup: PackagePricingByGroup = new Map(),
): WebhookPayload => {
  const first = entries[0]!;
  const totalPricePaid = sumOf((e: RegistrationEntry) =>
    Number.parseInt(e.attendee.price_paid, 10),
  )(entries);

  // A package member's base listing is free (the charge is the package
  // override), so `isPaidListing` alone would report `price_paid: null` for an
  // order that charged the buyer. Treat any positive amount actually paid as
  // paid so integrations don't under-count package revenue.
  const isPaidOrder =
    entries.some(({ listing }) => isPaidListing(listing)) || totalPricePaid > 0;
  return {
    address: first.attendee.address,
    // Order-level balance — the same on every entry, so read it from the first
    // rather than summing (summing would multiply it per booking line).
    amount_owed: first.attendee.remaining_balance,
    business_email: settings.businessEmail,
    currency,
    email: first.attendee.email,
    name: first.attendee.name,
    notification_type: "registration.completed",
    payment_id: first.attendee.payment_id || null,
    phone: first.attendee.phone,
    price_paid: isPaidOrder ? totalPricePaid : null,
    source,
    special_instructions: first.attendee.special_instructions,
    ticket_url: buildTicketUrl(entries),
    tickets: entries.map((entry) => ({
      date: entry.attendee.date,
      listing_name: entry.listing.name,
      listing_slug: entry.listing.slug,
      quantity: entry.attendee.quantity,
      ticket_token: entry.attendee.ticket_token,
      unit_price: ticketUnitPrice(entry, pricingByGroup),
    })),
    timestamp: nowIso(),
  };
};
