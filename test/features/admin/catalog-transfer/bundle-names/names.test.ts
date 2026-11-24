import { expect } from "@std/expect";
import { it as test } from "@std/testing/bdd";
import {
  checkItemNames,
  failureCollector,
} from "#routes/admin/catalog-transfer/bundle-names.ts";
import type { CatalogBundle } from "#routes/admin/catalog-transfer/schema.ts";
import { describeWithEnv } from "#test-utils/db.ts";

describeWithEnv("bundle name checks", { db: true }, () => {
  test("reports the same duplicate reason once per item", async () => {
    const bundle: CatalogBundle = {
      groups: [],
      kind: "bundle",
      listings: [
        {
          groups: [],
          listing: {
            maxAttendees: 5,
            maxPrice: 0,
            name: "Twin",
            unitPrice: 100,
          },
          parents: [],
        },
        {
          groups: [],
          listing: {
            maxAttendees: 5,
            maxPrice: 0,
            name: "Twin",
            unitPrice: 100,
          },
          parents: [],
        },
      ],
      version: 1,
    };
    const fail = failureCollector();
    await checkItemNames(bundle, fail);
    expect(fail.failures).toEqual([
      {
        item: "Twin",
        reasons: [
          'A bundle can\'t hold two items named "Twin" — rename one of them.',
        ],
      },
    ]);
  });

  test("indexes clean items for document-side lookups", async () => {
    const bundle: CatalogBundle = {
      groups: [{ group: { name: "Solo" }, members: [] }],
      kind: "bundle",
      listings: [
        {
          groups: [],
          listing: {
            maxAttendees: 5,
            maxPrice: 0,
            name: "Only",
            unitPrice: 100,
          },
          parents: [],
        },
      ],
      version: 1,
    };
    const fail = failureCollector();
    const indexes = await checkItemNames(bundle, fail);
    expect(fail.failures).toEqual([]);
    expect(indexes.listingIndexByName.get("only")).toBe(0);
    expect(indexes.groupIndexByName.get("solo")).toBe(0);
    expect(indexes.siteIndex.listing.size).toBeGreaterThanOrEqual(0);
  });
});
