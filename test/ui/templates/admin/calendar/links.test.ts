import { beforeAll, describe, it as test } from "@std/testing/bdd";
import { setupAdminPageTest } from "#test-utils/admin-page-test.ts";
import { expectIncludesAll } from "#test-utils/assertions.ts";
import { calendarAttendee, calendarDate, calendarHtml } from "./helpers.ts";

describe("adminCalendarPage links", () => {
  beforeAll(setupAdminPageTest);

  test("keeps the selected date in month, export and check-in links", () => {
    const html = calendarHtml({
      attendees: [calendarAttendee()],
      availableDates: [calendarDate("Sunday 16 August 2026", "2026-08-16")],
      dateFilter: "2026-03-15",
      viewMonth: "2026-08",
    });
    expectIncludesAll(html, [
      'href="/admin/calendar?date=2026-08-16#attendees"',
      'href="/admin/calendar?date=2026-03-15&amp;cal=2026-07#calendar"',
      'href="/admin/calendar/export?date=2026-03-15"',
      'name="return_url" type="hidden" value="/admin/calendar?date=2026-03-15#attendees"',
      'value="/admin/calendar#attendees"',
    ]);
  });
});
