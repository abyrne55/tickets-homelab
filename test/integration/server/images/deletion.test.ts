import { expect } from "@std/expect";
import { describe, it as test } from "@std/testing/bdd";
import { getListingWithCount, listingsTable } from "#db/listings/records.ts";
import { handleRequest } from "#routes";
import { linkStoredImage } from "#test/integration/server/images/helpers.ts";
import { describeWithEnv } from "#test-utils/db.ts";
import {
  mockFormRequest,
  withLocalStorageEnabled,
  withUnwritableStorage,
} from "#test-utils/mocks.ts";
import { setupListingAndLogin } from "#test-utils/session.ts";

/** Submit a POST to /admin/listing/:id/delete with confirmation */
const submitListingDelete = (
  listingId: number,
  listingName: string,
  cookie: string,
  csrfToken: string,
): Promise<Response> =>
  handleRequest(
    mockFormRequest(
      `/admin/listing/${listingId}/delete`,
      { confirm_identifier: listingName, csrf_token: csrfToken },
      cookie,
    ),
  );

describeWithEnv(
  "server images > deletion",
  {
    db: true,
    storage: "local",
  },
  () => {
    describe("listing deletion cleans up storage files", () => {
      /** Seed `stored` into the storage directory, delete the listing, and
       *  return which of the seeded files the request removed. */
      const deleteListingAndCaptureDeleted = async (
        listing: { id: number; name: string },
        cookie: string,
        csrfToken: string,
        stored: string[],
      ): Promise<string[]> => {
        const deleted: string[] = [];
        await withLocalStorageEnabled(async (dir) => {
          for (const name of stored)
            await Deno.writeTextFile(`${dir}/${name}`, "x");
          const response = await submitListingDelete(
            listing.id,
            listing.name,
            cookie,
            csrfToken,
          );
          expect(response.status).toBe(302);
          for (const name of stored) {
            const exists = await Deno.stat(`${dir}/${name}`).then(
              () => true,
              () => false,
            );
            if (!exists) deleted.push(name);
          }
        });
        return deleted;
      };

      test("keeps linked reusable image files when listing is deleted", async () => {
        const { listing, cookie, csrfToken } = await setupListingAndLogin();
        await linkStoredImage(listing.id, "listing-image.jpg");

        const deleted = await deleteListingAndCaptureDeleted(
          listing,
          cookie,
          csrfToken,
          ["listing-image.jpg"],
        );
        expect(deleted).toEqual([]);

        const gone = await getListingWithCount(listing.id);
        expect(gone).toBeNull();
      });

      test("deletes attachment from storage when listing is deleted", async () => {
        const { listing, cookie, csrfToken } = await setupListingAndLogin();
        await listingsTable.update(listing.id, {
          attachmentName: "doc.pdf",
          attachmentUrl: "listing-attachment.pdf",
        });

        const deleted = await deleteListingAndCaptureDeleted(
          listing,
          cookie,
          csrfToken,
          ["listing-attachment.pdf"],
        );
        expect(deleted).toEqual(["listing-attachment.pdf"]);
      });

      test("deletes attachment but keeps image when listing is deleted", async () => {
        const { listing, cookie, csrfToken } = await setupListingAndLogin();
        await linkStoredImage(listing.id, "both-image.jpg");
        await listingsTable.update(listing.id, {
          attachmentName: "both.pdf",
          attachmentUrl: "both-attachment.pdf",
        });

        const deleted = await deleteListingAndCaptureDeleted(
          listing,
          cookie,
          csrfToken,
          ["both-image.jpg", "both-attachment.pdf"],
        );
        expect(deleted).toEqual(["both-attachment.pdf"]);
      });

      test("succeeds when linked image storage deletion would fail during listing deletion", async () => {
        const { listing, cookie, csrfToken } = await setupListingAndLogin();
        await linkStoredImage(listing.id, "failing-image.jpg");

        await withUnwritableStorage(async () => {
          const response = await submitListingDelete(
            listing.id,
            listing.name,
            cookie,
            csrfToken,
          );
          expect(response.status).toBe(302);

          const deleted = await getListingWithCount(listing.id);
          expect(deleted).toBeNull();
        });
      });

      test("skips storage cleanup when listing has no image or attachment", async () => {
        const { listing, cookie, csrfToken } = await setupListingAndLogin();

        const deleted = await deleteListingAndCaptureDeleted(
          listing,
          cookie,
          csrfToken,
          ["unrelated.jpg"],
        );
        expect(deleted).toEqual([]);
      });
    });
  },
);
