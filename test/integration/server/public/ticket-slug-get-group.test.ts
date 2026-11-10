import { assert, assertStringIncludes } from "@std/assert";
import { expect } from "@std/expect";
import { describe, it as test } from "@std/testing/bdd";
import { imagesTable, setItemsForImage } from "#db/images.ts";
import { settings } from "#db/settings.ts";
import { handleRequest } from "#routes";
import { nonEmptyString } from "#shared/validation/string.ts";
import { assertPublicHtml } from "#test-utils/assertions.ts";
import { describeWithEnv } from "#test-utils/db.ts";
import { bookTestAttendee } from "#test-utils/db-helpers/attendees.ts";
import { createTestGroup } from "#test-utils/db-helpers/groups.ts";
import {
  createTestListing,
  deactivateTestListing,
} from "#test-utils/db-helpers/listings.ts";
import { mockRequest } from "#test-utils/mocks.ts";

describeWithEnv(
  "server public > ticket slug GET (group)",
  { db: true, triggers: true },
  () => {
    describe("GET /ticket/:slug", () => {
      test("shows tickets left only for a listing that opts in", async () => {
        const group = await createTestGroup({ slug: "remaining-group" });
        const flagged = await createTestListing({
          groupId: group.id,
          maxAttendees: 10,
          name: "Flagged Listing",
          showRemaining: true,
        });
        await createTestListing({
          groupId: group.id,
          maxAttendees: 10,
          name: "Plain Listing",
        });
        await bookTestAttendee([flagged.id], "Alice");
        await bookTestAttendee([flagged.id], "Bob");

        const html = await (
          await handleRequest(mockRequest(`/ticket/${group.slug}`))
        ).text();
        assertStringIncludes(html, "8 tickets left");
        expect(html.split("tickets-remaining").length - 1).toBe(1);
      });

      /** G1 (capacity 25) holding L1 (own cap 1000), L2 (3) and L3 (1), all
       * showing tickets left. `counts` reads the page's labels, sorted so row
       * order doesn't matter. */
      const cappedGroupScenario = async () => {
        const group = await createTestGroup({
          maxAttendees: 25,
          slug: "capped-group",
        });
        const make = (name: string, maxAttendees: number) =>
          createTestListing({
            groupId: group.id,
            maxAttendees,
            name,
            showRemaining: true,
          });
        const l1 = await make("Listing One", 1000);
        const l2 = await make("Listing Two", 3);
        const l3 = await make("Listing Three", 1);
        const counts = async (): Promise<string[]> => {
          const html = await (
            await handleRequest(mockRequest(`/ticket/${group.slug}`))
          ).text();
          return [...html.matchAll(/class="tickets-remaining">([^<]+)</g)]
            .map((match) => match[1]!)
            .sort();
        };
        return { counts, l1, l2, l3 };
      };

      test("caps each listing's tickets left by the group capacity", async () => {
        const { counts, l1 } = await cappedGroupScenario();

        // Nothing sold: L1 is limited by the group's 25, the others by their own.
        expect(await counts()).toEqual([
          "1 ticket left",
          "25 tickets left",
          "3 tickets left",
        ]);

        // Two sold on L1 shrink the shared pool, so L1 drops while L2 stays at
        // its own tighter cap.
        await bookTestAttendee([{ listingId: l1.id, quantity: 2 }], "Alice");
        expect(await counts()).toEqual([
          "1 ticket left",
          "23 tickets left",
          "3 tickets left",
        ]);
      });

      test("sold-out listings drop their count while L1 tracks the shared pool", async () => {
        const { counts, l2, l3 } = await cappedGroupScenario();

        // Buy all 3 of L2 and the 1 of L3: the pool falls to 21, both sold-out
        // rows lose their label, and L1 shows what the pool has left.
        await bookTestAttendee(
          [
            { listingId: l2.id, quantity: 3 },
            { listingId: l3.id, quantity: 1 },
          ],
          "Bob",
        );
        expect(await counts()).toEqual(["21 tickets left"]);
      });

      test("renders ticket page for group slug", async () => {
        const group = await createTestGroup({
          name: "Public Group",
          slug: "public-group",
        });
        const listing1 = await createTestListing({
          groupId: group.id,
          maxAttendees: 50,
          name: "Group Listing 1",
        });
        const listing2 = await createTestListing({
          groupId: group.id,
          maxAttendees: 50,
          name: "Group Listing 2",
        });

        await assertPublicHtml(
          `/ticket/${group.slug}`,
          "Public Group",
          "Continue",
          "Select Tickets",
          "Group Listing 1",
          "Group Listing 2",
          `action="/ticket/${group.slug}"`,
          `quantity_${listing1.id}`,
          `quantity_${listing2.id}`,
        );
      });

      test("shows group name and description on multi-listing group page", async () => {
        const group = await createTestGroup({
          description: "A wonderful festival with multiple listings",
          name: "Festival Group",
          slug: "festival-group",
        });
        await createTestListing({
          groupId: group.id,
          maxAttendees: 50,
          name: "Festival Listing A",
        });
        await createTestListing({
          groupId: group.id,
          maxAttendees: 50,
          name: "Festival Listing B",
        });

        await assertPublicHtml(
          `/ticket/${group.slug}`,
          "Festival Group",
          "A wonderful festival with multiple listings",
        );
      });

      test("shows the linked group image on the group ticket page", async () => {
        const group = await createTestGroup({
          name: "Poster Group",
          slug: "poster-group",
        });
        await createTestListing({
          groupId: group.id,
          maxAttendees: 50,
          name: "Poster Group Listing",
        });
        const image = await imagesTable.insert({
          altText: "Poster group hero",
          filename: nonEmptyString("poster-group.webp"),
          filenameThumb: nonEmptyString("poster-group-thumb.webp"),
          name: "Poster group image",
        });
        await setItemsForImage(image.id, [{ id: group.id, kind: "group" }]);

        await assertPublicHtml(
          `/ticket/${group.slug}`,
          "/image/poster-group.webp",
          'alt="Poster group hero"',
        );
      });

      test("returns 404 when group has no active listings", async () => {
        const group = await createTestGroup({
          name: "Empty Group",
          slug: "empty-group",
        });
        const listing = await createTestListing({
          groupId: group.id,
          maxAttendees: 50,
          name: "Inactive In Group",
        });
        await deactivateTestListing(listing.id);

        const response = await handleRequest(
          mockRequest(`/ticket/${group.slug}`),
        );
        expect(response.status).toBe(404);
      });

      test("group terms override global terms", async () => {
        await settings.update.terms("GLOBAL TERMS UNIQUE");
        const group = await createTestGroup({
          name: "Terms Group",
          slug: "terms-group",
          termsAndConditions: "GROUP TERMS UNIQUE",
        });
        await createTestListing({
          groupId: group.id,
          maxAttendees: 50,
          name: "Terms Listing",
        });

        const response = await handleRequest(
          mockRequest(`/ticket/${group.slug}`),
        );
        const html = await response.text();
        assertStringIncludes(html, "GROUP TERMS UNIQUE");
        assert(!html.includes("GLOBAL TERMS UNIQUE"));
      });

      test("group terms fall back to global when group terms are empty", async () => {
        await settings.update.terms("GLOBAL FALLBACK UNIQUE");
        const group = await createTestGroup({
          name: "Fallback Group",
          slug: "fallback-group",
          termsAndConditions: "",
        });
        await createTestListing({
          groupId: group.id,
          maxAttendees: 50,
          name: "Fallback Listing",
        });

        const response = await handleRequest(
          mockRequest(`/ticket/${group.slug}`),
        );
        const html = await response.text();
        assertStringIncludes(html, "GLOBAL FALLBACK UNIQUE");
      });

      test("group page shows shared date selector for daily listings", async () => {
        const group = await createTestGroup({
          name: "Daily Group",
          slug: "daily-group",
        });
        await createTestListing({
          bookableDays: ["Monday"],
          groupId: group.id,
          listingType: "daily",
          maxAttendees: 10,
          maximumDaysAfter: 14,
          minimumDaysBefore: 0,
          name: "Daily A",
        });
        await createTestListing({
          bookableDays: ["Monday", "Tuesday"],
          groupId: group.id,
          listingType: "daily",
          maxAttendees: 10,
          maximumDaysAfter: 14,
          minimumDaysBefore: 0,
          name: "Daily B",
        });

        await assertPublicHtml(
          `/ticket/${group.slug}`,
          "Select Date",
          'name="date"',
        );
      });
    });
  },
);
