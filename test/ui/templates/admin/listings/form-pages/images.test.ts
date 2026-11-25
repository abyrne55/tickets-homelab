import { assert } from "@std/assert";
import { describe, it as test } from "@std/testing/bdd";
import {
  adminDuplicateListingPage,
  adminListingNewPage,
} from "#templates/admin/listings/form-pages.tsx";
import {
  detailHtml,
  editPanelHtml,
  registerListingTemplateHooks,
} from "#test/ui/templates/admin/listings/helpers.ts";
import { OWNER_SESSION } from "#test-utils/admin-page-test.ts";
import { describeWithEnv } from "#test-utils/db.ts";
import { testListingWithCount } from "#test-utils/factories.ts";
import { withStorageDisabled, withStorageEnabled } from "#test-utils/mocks.ts";

/** Neither the duplicate form nor the new-listing form ever renders an image
 *  control — the shared assertion for the two storage-ownership tests. */
const expectNoImageInDuplicateAndNew = (
  listing: Parameters<typeof adminDuplicateListingPage>[0],
): void => {
  assert(
    !adminDuplicateListingPage(listing, [], OWNER_SESSION).includes(
      'name="image"',
    ),
  );
  assert(!adminListingNewPage([], OWNER_SESSION).includes('name="image"'));
};

describeWithEnv("listing images", { storage: "local" }, () => {
  registerListingTemplateHooks();

  describe("adminListingPage image section", () => {
    test("does not show image upload on detail page", () => {
      const html = detailHtml(testListingWithCount({ image_url: "" }));
      assert(!html.includes('type="file"'));
      assert(!html.includes('name="image"'));
    });
  });

  describe("listing form image ownership", () => {
    test("does not show image controls on the edit form", () => {
      withStorageEnabled(() => {
        const html = editPanelHtml(
          testListingWithCount({ image_url: "current.jpg" }),
        );
        assert(!html.includes('name="image"'));
        assert(!html.includes("Remove Image"));
        assert(!html.includes("/image/delete"));
        assert(!html.includes("listing-image-full"));
      });
    });

    test("does not show image controls on duplicate or create forms", () => {
      withStorageEnabled(() => {
        expectNoImageInDuplicateAndNew(
          testListingWithCount({ image_url: "current.jpg" }),
        );
      });
    });

    test("keeps image controls absent when storage is disabled", () => {
      withStorageDisabled(() => {
        const listing = testListingWithCount({ image_url: "current.jpg" });
        assert(!editPanelHtml(listing).includes('name="image"'));
        expectNoImageInDuplicateAndNew(listing);
      });
    });
  });
});
