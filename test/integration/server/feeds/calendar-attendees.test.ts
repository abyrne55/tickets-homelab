/**
 * Tests for the caldav calendar attendee feeds
 */

import { expect } from "@std/expect";
import { it as test } from "@std/testing/bdd";
import { settings } from "#db/settings.ts";
import { handleRequest } from "#routes";
import { expectHtml } from "#test-utils/assertions.ts";
import { describeWithEnv } from "#test-utils/db.ts";
import { createTestListing } from "#test-utils/db-helpers/listings.ts";
import { mockRequest } from "#test-utils/mocks.ts";

const expectCalendarFeed = async (
  request: Request,
  opts: { contains?: string[]; notContains?: string[] } = {},
): Promise<void> => {
  const response = await handleRequest(request);
  expect(response.headers.get("content-type")).toBe(
    "text/calendar; charset=utf-8",
  );
  await expectHtml(response, {
    contains: opts.contains,
    notContains: opts.notContains,
    status: 200,
  });
};

describeWithEnv("calendar attendee feeds", { db: true }, () => {
  test("returns not found when disabled", async () => {
    const response = await handleRequest(mockRequest("/caldav/events.ics"));
    expect(response.status).toBe(404);
  });

  test("rejects unauthenticated requests when enabled", async () => {
    await settings.update.calendarFeedsEnabled(true);
    const response = await handleRequest(mockRequest("/caldav/events.ics"));
    expect(response.status).toBe(401);
  });

  test("serves a cookie session without a CSRF header", async () => {
    const { getTestSession } = await import("#test-utils/session.ts");
    const { createTestAttendee } = await import(
      "#test-utils/db-helpers/attendees.ts"
    );
    await settings.update.calendarFeedsEnabled(true);
    await settings.update.calendarFeedsGroupBy("attendees");
    const listing = await createTestListing({
      date: "2026-08-01T09:30",
      maxAttendees: 10,
      name: "Cookie Show",
    });
    await createTestAttendee(
      listing.id,
      listing.slug,
      "Cookie Person",
      "cookie@test.com",
    );

    // A calendar client sends its session cookie but no x-csrf-token header,
    // so this safe GET must not demand one — otherwise the feed is unusable
    // from a browser/calendar session.
    const { cookie } = await getTestSession();
    await expectCalendarFeed(
      mockRequest("/caldav/events.ics", { headers: { cookie } }),
      { contains: ["SUMMARY:Cookie Person"] },
    );
  });

  test("returns attendee-grouped events for API keys", async () => {
    const { createTestApiKeyFull, requestAsApiKey } = await import(
      "#test-utils/session.ts"
    );
    const { createTestAttendee } = await import(
      "#test-utils/db-helpers/attendees.ts"
    );
    await settings.update.calendarFeedsEnabled(true);
    await settings.update.calendarFeedsGroupBy("attendees");
    const { apiKey } = await createTestApiKeyFull("Calendar");
    const listing = await createTestListing({
      date: "2026-08-01T09:30",
      location: "Main Hall",
      maxAttendees: 10,
      name: "Summer Show",
    });
    await createTestAttendee(
      listing.id,
      listing.slug,
      "Alice Example",
      "a@test.com",
    );

    await expectCalendarFeed(requestAsApiKey("/caldav/events.ics", apiKey), {
      contains: [
        "BEGIN:VEVENT",
        "SUMMARY:Alice Example",
        "DESCRIPTION:Summer Show",
        "DTSTART:20260801T093000Z",
        "LOCATION:Main Hall",
        "/admin/attendees/",
      ],
    });
  });

  test("returns listing-grouped events for API keys", async () => {
    const { createTestApiKeyFull, requestAsApiKey } = await import(
      "#test-utils/session.ts"
    );
    const { createTestAttendee } = await import(
      "#test-utils/db-helpers/attendees.ts"
    );
    await settings.update.calendarFeedsEnabled(true);
    await settings.update.calendarFeedsGroupBy("listings");
    const { apiKey } = await createTestApiKeyFull("Calendar Listings");
    const listing = await createTestListing({
      date: "2026-09-02T10:00",
      maxAttendees: 10,
      name: "Autumn Show",
    });
    await createTestAttendee(
      listing.id,
      listing.slug,
      "Bob Example",
      "b@test.com",
    );

    await expectCalendarFeed(requestAsApiKey("/caldav/events.ics", apiKey), {
      contains: ["SUMMARY:Autumn Show", "DESCRIPTION:Bob Example"],
    });
  });

  test("omits dateless bookings and falls back to attendee id for blank names", async () => {
    const { createTestApiKeyFull, requestAsApiKey } = await import(
      "#test-utils/session.ts"
    );
    const { createTestAttendeeDirect } = await import(
      "#test-utils/db-helpers/attendees.ts"
    );
    await settings.update.calendarFeedsEnabled(true);
    const { apiKey } = await createTestApiKeyFull("Calendar Blank");
    const dated = await createTestListing({
      date: "2026-11-04T12:00",
      maxAttendees: 10,
      name: "Dated Blank",
    });
    const dateless = await createTestListing({
      maxAttendees: 10,
      name: "Dateless",
    });
    await createTestAttendeeDirect(dated.id, "", "blank@test.com");
    await createTestAttendeeDirect(dateless.id, "No Date", "nodate@test.com");

    await expectCalendarFeed(requestAsApiKey("/caldav/events.ics", apiKey), {
      contains: ["SUMMARY:Attendee 1"],
      notContains: ["No Date"],
    });
  });
});
