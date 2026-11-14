import { expect } from "@std/expect";
import { describe, it as test } from "@std/testing/bdd";
import {
  shortListingName,
  withShortNames,
} from "#templates/public/reservations/listing-name.ts";
import { ticketListing } from "#test/ui/templates/helpers.ts";

const short = shortListingName("Car Show 2026");

describe("shortListingName", () => {
  test("strips the prefix with various separators", () => {
    expect(short("Car Show 2026 Regular")).toBe("Regular");
    expect(short("Car Show 2026 - VIP")).toBe("VIP");
    expect(short("Car Show 2026: VIP")).toBe("VIP");
    expect(short("Car Show 2026 – VIP")).toBe("VIP");
  });

  test("matches case-insensitively", () => {
    expect(short("car show 2026 Regular")).toBe("Regular");
  });

  test("needs a word boundary", () => {
    expect(short("Car Show 20267")).toBe("Car Show 20267");
  });

  test("keeps the full name when nothing would remain", () => {
    expect(short("Car Show 2026")).toBe("Car Show 2026");
    expect(short("Car Show 2026 - ")).toBe("Car Show 2026 - ");
  });

  test("keeps the full name when the prefix does not match", () => {
    expect(short("Bike Show Regular")).toBe("Bike Show Regular");
  });
});

describe("withShortNames", () => {
  const rows = [
    {
      info: ticketListing({ id: 1, name: "Car Show 2026 Regular" }),
      node: { kind: "listing", listingId: 1 },
    },
  ] as unknown as Parameters<typeof withShortNames>[1];

  test("returns the rows unchanged without a prefix", () => {
    expect(withShortNames(undefined, rows)).toEqual(rows);
  });

  test("shortens names and leaves ids alone", () => {
    const [row] = withShortNames("Car Show 2026", rows);
    expect(row?.info.listing.name).toBe("Regular");
    expect(row?.info.listing.id).toBe(1);
    expect(rows[0]?.info.listing.name).toBe("Car Show 2026 Regular");
  });
});
