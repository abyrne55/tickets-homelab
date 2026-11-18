import { assert, assertStringIncludes } from "@std/assert";
import { expect } from "@std/expect";
import { describe, it as test } from "@std/testing/bdd";
import { expectIncludesAll } from "#test-utils/assertions.ts";
import { describeWithEnv } from "#test-utils/db.ts";
import { createTestAttendeeWithToken } from "#test-utils/db-helpers/attendees.ts";
import { awaitTestRequest } from "#test-utils/mocks.ts";
import { createTestScannerSession } from "#test-utils/role-sessions.ts";
import { createTestEditorSession } from "#test-utils/session.ts";
import { withSetting } from "#test-utils/settings.ts";
import { readTicketPage, setupCheckinTest } from "./helpers.ts";

describeWithEnv("check-in page role authorization", { db: true }, () => {
  describe("GET /checkin/:tokens (door-only session)", () => {
    test("a scanner's door role alone offers no action on a token no row can change", async () => {
      const { refundThroughLedger } = await import("#test-utils/ledger.ts");
      const { attendee, token } = await createTestAttendeeWithToken(
        "Still Home",
        "still-home@test.com",
      );
      const scanner = await createTestScannerSession();
      await refundThroughLedger(attendee.id, attendee.listing_id);

      const body = await readTicketPage(token, scanner.cookie);
      // A door role is one half of the bulk action's gate; the other half is
      // a row the POST could change. A fully refunded token meets neither
      // offer: the POST would refuse, so the page must not advertise it.
      assertStringIncludes(body, "Still Home");
      assert(!body.includes("Check In All"));
      assert(!body.includes("Check Out All"));
      assert(!body.includes('name="check_in"'));
    });

    test("keeps the door-safe columns even when a staff layout names contact ones", async () => {
      const { token } = await setupCheckinTest("Perry", "perry@test.com");
      const scanner = await createTestScannerSession();

      const body = await withSetting(
        { attendee_column_order: "{{name}} {{email}} {{phone}}" },
        async () =>
          (
            await awaitTestRequest(`/checkin/${token}`, {
              cookie: scanner.cookie,
            })
          ).text(),
      );

      // An operator's saved column order is a staff-table choice; the
      // door-only ticket page always reads its own fixed door-safe columns,
      // so a contact column can never ride onto a door worker's screen.
      assertStringIncludes(body, "<th>Name</th>");
      assert(!body.includes("perry@test.com"));
      assert(!body.includes("<th>Email</th>"));
      assert(!body.includes("<th>Phone</th>"));
    });
  });

  describe("GET /checkin/:tokens (editor session)", () => {
    test("editors cannot use check-in tokens to decrypt attendee details", async () => {
      const { cookie } = await createTestEditorSession({
        token: "checkin-editor",
        username: "checkin-editor",
      });
      const { token } = await createTestAttendeeWithToken(
        "Editor Hidden",
        "editor-hidden@example.com",
      );

      const response = await awaitTestRequest(`/checkin/${token}`, { cookie });
      expect(response.status).toBe(403);
      const body = await response.text();
      assert(!body.includes("Editor Hidden"));
      assert(!body.includes("editor-hidden@example.com"));
    });
  });

  describe("GET /checkin/:tokens (scanner session)", () => {
    test("shows a scanner login the attendee and the check-in toggle", async () => {
      const { token } = await createTestAttendeeWithToken(
        "Door Guest",
        "doorguest@example.com",
      );
      const { cookie } = await createTestScannerSession({
        token: "checkin-scanner",
      });

      const body = await readTicketPage(token, cookie);

      expectIncludesAll(body, ["Door Guest", "Check In All"]);
      // The admin pages behind these links stay shut for a scanner login, so
      // the page must not promise them (never render a forbidden link).
      assert(!body.includes('href="/admin/attendees/'));
      assert(!body.includes('href="/admin/listing/'));
    });
  });
});
