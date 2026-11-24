import { expect } from "@std/expect";
import { describe, it as test } from "@std/testing/bdd";
import { configurableTableLayouts } from "#shared/tables/configurable.ts";

const ATTENDEE_COLUMNS = [
  "status",
  "date",
  "name",
  "listings",
  "email",
  "phone",
  "address",
  "special_instructions",
  "answers",
  "qty",
  "ticket",
  "registered",
];

describe("configurable table layouts", () => {
  test("declares every attendee column as visible by default", () => {
    expect(configurableTableLayouts.attendee.keys).toEqual(ATTENDEE_COLUMNS);
    expect(configurableTableLayouts.attendee.defaultColumnKeys).toEqual(
      ATTENDEE_COLUMNS,
    );
  });

  test("rejects keys from the other configurable table", () => {
    expect(configurableTableLayouts.attendee.validate("{{profit}}")).not.toBe(
      null,
    );
    expect(configurableTableLayouts.listing.validate("{{qty}}")).not.toBe(null);
  });
});
