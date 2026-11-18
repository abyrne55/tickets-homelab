import { expect } from "@std/expect";
import { afterAll, beforeAll, describe, it as test } from "@std/testing/bdd";
import { SERVICING_KIND } from "#db/attendees/kind.ts";
import {
  type CalendarAttendee,
  generateCalendarCsv,
} from "#routes/admin/calendar-csv.ts";
import {
  resetEffectiveDomain,
  setEffectiveDomainForTest,
} from "#shared/config.ts";
import { testAttendee } from "#test-utils/factories.ts";

const CSV_DOMAIN = "calendar.example.com";
const ATTENDEE_HEADER =
  "Name,Email,Phone,Address,Special Instructions,Quantity,Registered,Price Paid,Transaction ID,Checked In,Ticket Token,Ticket URL";
const CALENDAR_HEADER = `Listing,Type,Date,${ATTENDEE_HEADER}`;
const ATTENDEE_ROW = `John Doe,john@example.com,,,,1,2024-01-01T12:00:00.000Z,0.00,,0,test-token-1,https://${CSV_DOMAIN}/t/test-token-1`;
const CALENDAR_ROW = `Bouncy Castle,Attendee,2026-03-15,${ATTENDEE_ROW}`;

const calAttendee = (
  over: Partial<CalendarAttendee> = {},
): CalendarAttendee => ({
  ...testAttendee(over),
  date: "2026-03-15",
  listingDate: "",
  listingLocation: "",
  listingName: "Bouncy Castle",
  ...over,
});

describe("generateCalendarCsv", () => {
  beforeAll(() => {
    setEffectiveDomainForTest(CSV_DOMAIN);
  });
  afterAll(resetEffectiveDomain);

  test("generates the base header for an empty export", () => {
    expect(generateCalendarCsv([])).toBe(CALENDAR_HEADER);
  });

  test("omits empty listing date and location columns", () => {
    expect(generateCalendarCsv([calAttendee()]).split("\n")).toEqual([
      CALENDAR_HEADER,
      CALENDAR_ROW,
    ]);
  });

  test("shows an inclusive date range for a multi-day booking", () => {
    expect(
      generateCalendarCsv([calAttendee({ end_date: "2026-03-18" })]).split(
        "\n",
      ),
    ).toEqual([
      CALENDAR_HEADER,
      `Bouncy Castle,Attendee,2026-03-15 to 2026-03-17,${ATTENDEE_ROW}`,
    ]);
  });

  test("includes exact listing date cells when only some rows have a listing date", () => {
    const csv = generateCalendarCsv([
      calAttendee({ listingDate: "2026-06-15T14:00:00.000Z" }),
      calAttendee({ id: 2, listingName: "Plain Listing" }),
    ]);
    expect(csv.split("\n")).toEqual([
      `Listing,Type,Listing Date,Date,${ATTENDEE_HEADER}`,
      `Bouncy Castle,Attendee,2026-06-15 15:00,2026-03-15,${ATTENDEE_ROW}`,
      `Plain Listing,Attendee,,2026-03-15,${ATTENDEE_ROW}`,
    ]);
  });

  test("includes exact listing location cells when only some rows have a location", () => {
    const csv = generateCalendarCsv([
      calAttendee({ listingLocation: "Village Hall" }),
      calAttendee({ id: 2, listingName: "Plain Listing" }),
    ]);
    expect(csv.split("\n")).toEqual([
      `Listing,Type,Listing Location,Date,${ATTENDEE_HEADER}`,
      `Bouncy Castle,Attendee,Village Hall,2026-03-15,${ATTENDEE_ROW}`,
      `Plain Listing,Attendee,,2026-03-15,${ATTENDEE_ROW}`,
    ]);
  });

  test("includes the booking date in its exact column", () => {
    const csv = generateCalendarCsv([calAttendee({ date: "2026-03-20" })]);
    expect(csv.split("\n")).toEqual([
      CALENDAR_HEADER,
      `Bouncy Castle,Attendee,2026-03-20,${ATTENDEE_ROW}`,
    ]);
  });

  test("escapes a listing name containing a comma", () => {
    const csv = generateCalendarCsv([
      calAttendee({ listingName: "Listing, Special" }),
    ]);
    expect(csv.split("\n")).toEqual([
      CALENDAR_HEADER,
      `"Listing, Special",Attendee,2026-03-15,${ATTENDEE_ROW}`,
    ]);
  });

  test("includes the exact standard attendee cells", () => {
    const csv = generateCalendarCsv([
      calAttendee({
        checked_in: 1,
        created: "2024-01-15T10:30:00Z",
        payment_id: "pi_abc",
        price_paid: "2000",
        quantity: 2,
      }),
    ]);
    expect(csv.split("\n")).toEqual([
      CALENDAR_HEADER,
      `Bouncy Castle,Attendee,2026-03-15,John Doe,john@example.com,,,,2,2024-01-15T10:30:00.000Z,20.00,pi_abc,1,test-token-1,https://${CSV_DOMAIN}/t/test-token-1`,
    ]);
  });

  test("generates multiple exact rows", () => {
    const csv = generateCalendarCsv([
      calAttendee(),
      calAttendee({
        id: 2,
        listingName: "Other Listing",
        name: "Jane Smith",
      }),
    ]);
    expect(csv.split("\n")).toEqual([
      CALENDAR_HEADER,
      CALENDAR_ROW,
      `Other Listing,Attendee,2026-03-15,Jane Smith,john@example.com,,,,1,2024-01-01T12:00:00.000Z,0.00,,0,test-token-1,https://${CSV_DOMAIN}/t/test-token-1`,
    ]);
  });

  test("leaves the exact booking date cell blank when the date is null", () => {
    const csv = generateCalendarCsv([calAttendee({ date: null })]);
    expect(csv.split("\n")).toEqual([
      CALENDAR_HEADER,
      `Bouncy Castle,Attendee,,${ATTENDEE_ROW}`,
    ]);
  });

  describe("servicing policy", () => {
    test("marks servicing rows as 'Service event' and omits their dead /t/ ticket URL", () => {
      // The calendar includes servicing holds (operator decision), so the CSV
      // includes them too — but marked by a Type column and with no followable
      // ticket URL: a servicing token's `/t/:token` 404s (kind filter), and a dead
      // link must never be rendered. A real attendee keeps its ticket URL.
      const service = calAttendee({
        id: 1,
        kind: SERVICING_KIND,
        listing_id: 1,
        listingName: "Boiler Room",
        name: "Boiler Service",
        ticket_token: "svc-token",
      });
      const attendee = calAttendee({
        id: 2,
        listing_id: 1,
        listingName: "Boiler Room",
        name: "Jane Doe",
        ticket_token: "att-token",
      });
      const csv = generateCalendarCsv([service, attendee]);
      expect(csv.split("\n")).toEqual([
        CALENDAR_HEADER,
        "Boiler Room,Service event,2026-03-15,Boiler Service,john@example.com,,,,1,2024-01-01T12:00:00.000Z,0.00,,0,svc-token,",
        `Boiler Room,Attendee,2026-03-15,Jane Doe,john@example.com,,,,1,2024-01-01T12:00:00.000Z,0.00,,0,att-token,https://${CSV_DOMAIN}/t/att-token`,
      ]);
    });
  });
});
