/**
 * Re-sending an attendee's booking notification.
 *
 * A standalone booking notifies once. A booking made through a package
 * notifies for every line of that package, so a re-send is the same message
 * the attendee got the first time, not one member row standing in for the
 * whole bundle.
 */

import { assert, assertStringIncludes } from "@std/assert";
import { expect } from "@std/expect";
import { it as test } from "@std/testing/bdd";
import { t } from "#i18n";
import { activityMessages } from "#test-utils/activity-log.ts";
import {
  expectIncludesAll,
  expectRedirectWithFlash,
} from "#test-utils/assertions.ts";
import {
  emptyBookingLine,
  setupListingAndAttendee,
} from "#test-utils/attendees/helpers.ts";
import { describeWithEnv } from "#test-utils/db.ts";
import {
  createTestAttendee,
  markNotificationSendsOwed,
  submitAttendeeEdit,
} from "#test-utils/db-helpers/attendees.ts";
import { createTestGroup } from "#test-utils/db-helpers/groups.ts";
import { createTestListing } from "#test-utils/db-helpers/listings.ts";
import { createFreeTextQuestion } from "#test-utils/db-helpers/questions.ts";
import { configureTestEmail } from "#test-utils/email.ts";
import { stubFetchEachTest } from "#test-utils/fetch-stub.ts";
import { postListingSale, refundBookedOrder } from "#test-utils/ledger.ts";
import { adminFormPost, adminGet } from "#test-utils/session.ts";

const resend = async (attendeeId: number, name: string) => {
  await markNotificationSendsOwed(attendeeId);
  return adminFormPost(`/admin/attendees/${attendeeId}/resend-notification`, {
    confirm_identifier: name,
  });
};

/** How many "registered" entries the re-send wrote — one per line it notified. */
const registeredEntries = async (): Promise<number> =>
  (await activityMessages()).filter((one) =>
    one.startsWith("Attendee registered for"),
  ).length;

describeWithEnv("re-sending a standalone booking", { db: true }, () => {
  test("notifies that one booking and says it went", async () => {
    const { attendee } = await setupListingAndAttendee({
      listing: { name: "Solo Listing" },
      name: "On Their Own",
    });
    const before = await registeredEntries();

    const { response } = await resend(attendee.id, "On Their Own");

    expectRedirectWithFlash(
      `/admin/attendees/${attendee.id}/actions`,
      t("success.notification_resent"),
    )(response);
    expect((await registeredEntries()) - before).toBe(1);
  });
});

describeWithEnv("re-sending a booking made in a package", { db: true }, () => {
  test("notifies every line of that package, not just the one", async () => {
    const group = await createTestGroup({ isPackage: true, name: "Bundle" });
    const first = await createTestListing({
      groupId: group.id,
      maxAttendees: 100,
      name: "Bundled One",
    });
    const second = await createTestListing({
      groupId: group.id,
      maxAttendees: 100,
      name: "Bundled Two",
    });
    const { attendeesApi } = await import("#shared/db/attendees/api.ts");
    const made = await attendeesApi.createAttendeeAtomic({
      bookings: [
        { listingId: first.id, packageGroupId: group.id, quantity: 1 },
        { listingId: second.id, packageGroupId: group.id, quantity: 1 },
      ],
      email: "bundle@example.com",
      name: "Bundle Buyer",
    });
    if (!made.success) throw new Error("Expected the package booking to work");
    const attendee = made.attendees[0]!;
    const before = await registeredEntries();

    await resend(attendee.id, "Bundle Buyer");

    expect((await registeredEntries()) - before).toBe(2);
  });
});

describeWithEnv("the re-send page's send choice", { db: true }, () => {
  const pageHtml = async (attendeeId: number): Promise<string> => {
    const response = await adminGet(
      `/admin/attendees/${attendeeId}/resend-notification`,
    );
    expect(response.status).toBe(200);
    return response.text();
  };

  test("defaults to the email and offers no webhook when the listing has none", async () => {
    const { attendee } = await setupListingAndAttendee({
      name: "Email Only Choice",
    });

    const html = await pageHtml(attendee.id);

    // The email is the only thing to send, so the form carries the choice
    // hidden, and no radio offers a webhook that does not exist.
    assertStringIncludes(
      html,
      'name="resend_sides" type="hidden" value="email"',
    );
    assert(!html.includes('type="radio" value="webhooks"'));
    assert(!html.includes('type="radio" value="both"'));
  });

  test("offers the email, webhook, and both choices when a webhook exists", async () => {
    const { attendee } = await setupListingAndAttendee({
      listing: { webhookUrl: "https://hook.example.com/registration" },
      name: "Webhook Choice",
    });

    const html = await pageHtml(attendee.id);

    expectIncludesAll(html, [
      'checked name="resend_sides" type="radio" value="email"',
      'name="resend_sides" type="radio" value="webhooks"',
      'name="resend_sides" type="radio" value="both"',
    ]);
    // The choice is a visible form field, not a hidden default.
    assert(!html.includes('name="resend_sides" type="hidden"'));
  });
});

describeWithEnv("re-sending for a line with no places", { db: true }, () => {
  test("is refused, and says why", async () => {
    const { attendee, listing } = await setupListingAndAttendee({
      name: "Gave It Up",
    });
    await emptyBookingLine(listing.id, attendee.id);
    const before = await registeredEntries();

    const { response } = await resend(attendee.id, "Gave It Up");

    expectRedirectWithFlash(
      `/admin/attendees/${attendee.id}/actions`,
      "Cannot re-send a notification for a no-quantity line",
      false,
    )(response);
    expect(await registeredEntries()).toBe(before);
  });
});

describeWithEnv("re-sending a purchase that was refunded", { db: true }, () => {
  test("is refused, and says why", async () => {
    const listing = await createTestListing({
      maxAttendees: 100,
      name: "Refunded Solo",
    });
    const { attendeesApi } = await import("#shared/db/attendees/api.ts");
    const made = await attendeesApi.createAttendeeAtomic({
      bookings: [{ listingId: listing.id, pricePaid: 300, quantity: 1 }],
      email: "refunded-solo@example.com",
      name: "Refunded Solo Buyer",
    });
    if (!made.success) throw new Error("Expected the booking to work");
    const attendee = made.attendees[0]!;
    await postListingSale({
      attendeeId: attendee.id,
      gross: 300,
      listingId: listing.id,
    });
    await refundBookedOrder(attendee.id, listing.id);
    const before = await registeredEntries();

    const { response } = await resend(attendee.id, "Refunded Solo Buyer");

    expectRedirectWithFlash(
      `/admin/attendees/${attendee.id}/actions`,
      "Cannot re-send a notification for a refunded purchase",
      false,
    )(response);
    expect(await registeredEntries()).toBe(before);
  });
});

describeWithEnv(
  "re-sending with a buyer's free-text answer",
  { db: true },
  () => {
    const fetch = stubFetchEachTest(() => new Response("{}"));

    /** The confirmation texts sent to this buyer, in send order. */
    const buyerEmailTexts = (buyer: string): string[] =>
      fetch.calls.flatMap(({ args }) => {
        const [, options] = args as [string, RequestInit];
        const body = JSON.parse(options.body as string) as {
          to?: string[];
          text?: string;
        };
        return body.to?.[0] === buyer && body.text !== undefined
          ? [body.text]
          : [];
      });

    test("renders the free-text answer as it stands now", async () => {
      await configureTestEmail();
      const listing = await createTestListing({ maxAttendees: 100 });
      const questionId = await createFreeTextQuestion([listing.id]);
      const attendee = await createTestAttendee(
        listing.id,
        listing.slug,
        "Current Wording",
        "wording@example.com",
        1,
        "",
        { [`question_${questionId}`]: "Coming by bus" },
      );
      const edited = await submitAttendeeEdit(attendee.id, {
        email: "wording@example.com",
        extra: { [`question_${questionId}`]: "Coming by train" },
        name: "Current Wording",
      });
      expect(edited.status).toBe(302);

      const { response } = await resend(attendee.id, "Current Wording");

      expectRedirectWithFlash(
        `/admin/attendees/${attendee.id}/actions`,
        t("success.notification_resent"),
      )(response);
      const resent = buyerEmailTexts("wording@example.com").at(-1);
      assertStringIncludes(resent ?? "", "Anything else?: Coming by train");
      assert(!(resent ?? "").includes("Coming by bus"));
    });
  },
);
