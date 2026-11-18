/**
 * The calendar CSV export: one row per booking, attendees across multiple
 * listings.
 */

import { isServicing } from "#db/attendees/kind.ts";
import { identity, mapById, requiredMapValue } from "#fp";
import { t } from "#i18n";
import {
  csvDateRange,
  listingInfoColumns,
  standardAttendeeColumns,
} from "#routes/admin/attendees-csv.ts";
import { getEffectiveDomain } from "#shared/config.ts";
import { type Column, CSV } from "#shared/csv/index.ts";
import { listingDetails } from "#shared/listing-details.ts";
import { formatDatetimeShortInTz } from "#shared/timezone.ts";
import { DEFAULT_TIMEZONE } from "#shared/timezone-default.ts";
import type { Attendee } from "#types";

/** Attendee with associated listing info for calendar CSV. */
export type CalendarAttendee = Attendee & {
  listingName: string;
  listingDate: string;
  listingLocation: string;
};

/**
 * Join attendees with their listings into calendar CSV rows, taking the listing
 * name and date/location from the attendee's `listing_id`. Callers guarantee
 * every attendee's listing is present in `listings`.
 */
export const toCalendarAttendees = <
  L extends { id: number; name: string; date: string; location: string },
>(
  attendees: readonly Attendee[],
  listings: readonly L[],
): CalendarAttendee[] => {
  const listingById = mapById(identity<L>)(listings);
  return attendees.map((a) => {
    const listing = requiredMapValue(
      listingById,
      a.listing_id,
      `Listing ${a.listing_id} missing`,
    );
    return { ...a, ...listingDetails(listing) };
  });
};

/** The row's type label for the calendar CSV: "Service event" for a servicing
 *  hold, "Attendee" for a real customer. Servicing rows carry blank contact
 *  fields, and no followable ticket URL. The Type column is what makes a hold
 *  readable in the export instead of looking like a customer with missing
 *  data. */
const typeLabel = (a: CalendarAttendee): string =>
  isServicing(a.kind) ? "Service event" : "Attendee";

/** The ordered calendar columns. Type and Listing name come first, then
 * optional listing date/location, the booking Date, and the standard attendee
 * columns. Pure — built per call so the active locale applies. */
const calendarColumns = ({
  attendees,
  domain,
  tz,
}: {
  attendees: CalendarAttendee[];
  domain: string;
  tz: string;
}): Column<CalendarAttendee>[] => [
  { header: t("terms.listing"), value: (a) => a.listingName },
  { header: "Type", value: typeLabel },
  ...listingInfoColumns<CalendarAttendee>(
    {
      show: attendees.some((a) => a.listingDate !== ""),
      value: (a) =>
        a.listingDate ? formatDatetimeShortInTz(a.listingDate, tz) : "",
    },
    {
      show: attendees.some((a) => a.listingLocation !== ""),
      value: (a) => a.listingLocation,
    },
  ),
  {
    header: t("common.date"),
    value: (a) => csvDateRange(a.date, a.end_date),
  },
  ...standardAttendeeColumns(domain),
];

/** CSV content for the calendar view. The Listing Date renders in `tz`. */
export const generateCalendarCsv = (
  attendees: CalendarAttendee[],
  tz: string = DEFAULT_TIMEZONE,
): string =>
  CSV.generate(
    attendees,
    calendarColumns({ attendees, domain: getEffectiveDomain(), tz }),
  );
