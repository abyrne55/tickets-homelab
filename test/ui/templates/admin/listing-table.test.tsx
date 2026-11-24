import { assert, assertStringIncludes } from "@std/assert";
import { expect } from "@std/expect";
import { beforeAll, describe, it as test } from "@std/testing/bdd";
import {
  configurableTableLayouts,
  type ListingColumnKey,
} from "#shared/tables/configurable.ts";
import { columnOrThrow } from "#shared/tables/definition.ts";
import {
  ListingsTableBlock,
  listingTable,
  renderListingsTableSection,
} from "#templates/admin/listing-table.tsx";
import { AttendeeTable } from "#templates/attendee-table/component.tsx";
import { setupAdminPageTest } from "#test-utils/admin-page-test.ts";
import { expectIncludesAll } from "#test-utils/assertions.ts";
import { testListingWithCount } from "#test-utils/factories.ts";
import type { ListingWithCount } from "#types";

const rawValue = (
  key: ListingColumnKey,
  listing: ListingWithCount,
): unknown => {
  const read = columnOrThrow(listingTable, key).rawValue;
  if (read === undefined) throw new Error(`Column ${key} has no raw value`);
  return read(listing, undefined);
};

describe("listingTable", () => {
  beforeAll(setupAdminPageTest);

  test("keeps configurable table keys separate at compile time and at run time", () => {
    const renderAttendees = () =>
      AttendeeTable({
        allowedDomain: "example.com",
        // @ts-expect-error Listing layouts cannot be passed to AttendeeTable.
        columnLayout: configurableTableLayouts.listing.defaultLayout,
        rows: [],
        showDate: false,
        showListing: false,
      });
    const renderListings = () =>
      renderListingsTableSection({
        // @ts-expect-error Attendee keys cannot be passed to listing table options.
        columnKeys: configurableTableLayouts.attendee.defaultColumnKeys,
        emptyText: "None",
        listings: [],
      });
    const renderInvalidEditorColumns = () =>
      // @ts-expect-error Editor tables cannot render staff-only columns.
      renderListingsTableSection({
        columnKeys: ["revenue"],
        emptyText: "None",
        listings: [],
        table: "editor",
      });

    expect(renderAttendees).toThrow('Column "description" is not in the table');
    expect(renderInvalidEditorColumns).toThrow(
      'Column "revenue" is not in the table',
    );
    expect(renderListings).toThrow('Column "listings" is not in the table');
  });

  test("returns an empty raw date when the listing has no date", () => {
    expect(rawValue("date", testListingWithCount({ date: "" }))).toBe("");
  });

  test("renders an explicit column selection", () => {
    const html = String(
      renderListingsTableSection({
        columnKeys: ["location"],
        emptyText: "None",
        listings: [testListingWithCount({ location: "Town Hall" })],
      }),
    );

    expectIncludesAll(html, ["<th>Location</th>", "<td>Town Hall</td>"]);
    assert(!html.includes("Listing name"));
  });

  test("renders a supported editor column", () => {
    const html = String(
      renderListingsTableSection({
        columnKeys: ["name"],
        emptyText: "None",
        listings: [testListingWithCount({ id: 7, name: "Gala" })],
        table: "editor",
      }),
    );

    assertStringIncludes(html, '<a href="/admin/listing/7/edit">Gala</a>');
    assert(!html.includes("Revenue"));
  });

  test("marks inactive listing rows", () => {
    const html = String(
      renderListingsTableSection({
        emptyText: "None",
        listings: [testListingWithCount({ active: false, name: "Past" })],
      }),
    );

    assertStringIncludes(html, '<tr class="inactive-row">');
  });

  test("keeps the linked thumbnail when a name filter is present", () => {
    const html = String(
      renderListingsTableSection({
        columnKeys: ["name"],
        emptyText: "None",
        filters: new Map([["name", "name | upcase"]]),
        listings: [
          testListingWithCount({
            id: 7,
            image_url: "https://example.com/gala.jpg",
            name: "Gala",
          }),
        ],
      }),
    );

    expectIncludesAll(html, [
      "listing-thumbnail",
      '<a href="/admin/listing/7">Gala</a>',
    ]);
    assert(!html.includes(">GALA<"));
  });

  test("uses the requested CSV export path", () => {
    const html = String(
      ListingsTableBlock({
        csvExport: true,
        csvHref: "/custom.csv",
        listings: [],
      }),
    );

    assertStringIncludes(html, 'href="/custom.csv"');
    assert(!html.includes('href="/admin/listings/csv"'));
  });

  test("uses the default CSV export path", () => {
    const html = String(ListingsTableBlock({ csvExport: true, listings: [] }));

    assertStringIncludes(html, 'href="/admin/listings/csv"');
  });
});
