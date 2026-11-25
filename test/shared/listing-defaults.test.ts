import { expect } from "@std/expect";
import { describe, it as test } from "@std/testing/bdd";
import {
  hasAnyListingDefault,
  LISTING_DEFAULT_FIELDS,
  type ListingDefaults,
  listingDefaultFieldClass,
  listingDefaultFormClasses,
  listingDefaultHintKey,
  listingDefaultInputName,
  listingDefaultLabelKey,
  parseListingDefaults,
  resolveListingDate,
  resolveListingDefaults,
  serializeListingDefaults,
  setListingDefaultFields,
} from "#shared/listing-defaults.ts";
import { testListing } from "#test-utils/factories.ts";
import { allEnglishMessages } from "#test-utils/i18n.ts";

const en = await allEnglishMessages(["listing-defaults"]);

const messages = en as Record<string, string>;

const fullDefaults: ListingDefaults = {
  bookableDays: ["Monday", "Wednesday"],
  hidden: true,
  maximumDaysAfter: 30,
  minimumDaysBefore: 2,
  thankYouUrl: "https://example.com/thanks",
  webhookUrl: "https://example.com/hook",
};

describe("shared > listing-defaults > resolveListingDefaults", () => {
  test("returns the listing unchanged when use_defaults is off", () => {
    const listing = testListing({ hidden: false, use_defaults: false });
    expect(resolveListingDefaults(listing, fullDefaults)).toBe(listing);
  });

  test("a narrow row inherits only the fields it selected", () => {
    // A read that selects some columns must come back with those columns'
    // effective values, and must not gain the ones it never asked for.
    const narrow = {
      bookable_days: ["Sunday"],
      id: 1,
      use_defaults: true,
    };

    const resolved = resolveListingDefaults(narrow, fullDefaults);

    expect(resolved.bookable_days).toEqual(["Monday", "Wednesday"]);
    expect(Object.keys(resolved).toSorted()).toEqual([
      "bookable_days",
      "id",
      "use_defaults",
    ]);
  });

  test("overlays every set default when use_defaults is on", () => {
    const listing = testListing({
      bookable_days: ["Sunday"],
      hidden: false,
      maximum_days_after: 90,
      minimum_days_before: 1,
      thank_you_url: "",
      use_defaults: true,
      webhook_url: "",
    });
    const resolved = resolveListingDefaults(listing, fullDefaults);
    expect(resolved.bookable_days).toEqual(["Monday", "Wednesday"]);
    expect(resolved.hidden).toBe(true);
    expect(resolved.maximum_days_after).toBe(30);
    expect(resolved.minimum_days_before).toBe(2);
    expect(resolved.thank_you_url).toBe("https://example.com/thanks");
    expect(resolved.webhook_url).toBe("https://example.com/hook");
  });

  test("leaves fields without a default untouched", () => {
    const listing = testListing({
      hidden: false,
      use_defaults: true,
    });
    // Only a webhook default is set — every other field keeps its own value.
    const resolved = resolveListingDefaults(listing, {
      webhookUrl: "https://example.com/only",
    });
    expect(resolved.webhook_url).toBe("https://example.com/only");
    expect(resolved.hidden).toBe(false);
  });

  test("does not mutate the original listing", () => {
    const listing = testListing({ hidden: false, use_defaults: true });
    resolveListingDefaults(listing, { hidden: true });
    expect(listing.hidden).toBe(false);
  });
});

describe("shared > listing-defaults > hasAnyListingDefault", () => {
  test("false for an empty defaults object", () => {
    expect(hasAnyListingDefault({})).toBe(false);
  });

  test("true when at least one default is set", () => {
    expect(hasAnyListingDefault({ hidden: false })).toBe(true);
  });
});

describe("shared > listing-defaults > setListingDefaultFields", () => {
  test("returns only the set fields, in display order", () => {
    const fields = setListingDefaultFields({
      hidden: true,
      webhookUrl: "https://example.com/hook",
    });
    // Display order is webhook_url before hidden, regardless of insertion.
    expect(fields.map((f) => f.field)).toEqual(["webhook_url", "hidden"]);
  });

  test("is empty when nothing is set", () => {
    expect(setListingDefaultFields({})).toEqual([]);
  });
});

describe("shared > listing-defaults > i18n + input-name builders", () => {
  const hiddenField = LISTING_DEFAULT_FIELDS.find(
    (f) => f.field === "hidden",
  ) as (typeof LISTING_DEFAULT_FIELDS)[number];

  test("builds the form input name from the column", () => {
    expect(listingDefaultInputName(hiddenField)).toBe("default_hidden");
  });

  test("builds the label key from the column", () => {
    expect(listingDefaultLabelKey(hiddenField)).toBe(
      "listing_defaults.field.hidden.label",
    );
  });

  test("builds the hint key from the column", () => {
    expect(listingDefaultHintKey(hiddenField)).toBe(
      "listing_defaults.field.hidden.hint",
    );
  });
});

describe("shared > listing-defaults > CSS marker classes", () => {
  test("kebab-cases the field name", () => {
    expect(listingDefaultFieldClass("show_remaining")).toBe(
      "listing-form--default-show-remaining",
    );
  });

  test("emits one class per set default", () => {
    expect(
      listingDefaultFormClasses({ hidden: true, showRemaining: true }),
    ).toBe("listing-form--default-show-remaining listing-form--default-hidden");
  });

  test("is empty when nothing is set", () => {
    expect(listingDefaultFormClasses({})).toBe("");
  });
});

describe("shared > listing-defaults > parse/serialize round-trip", () => {
  test("round-trips a full defaults object", () => {
    const json = serializeListingDefaults(fullDefaults);
    expect(parseListingDefaults(json)).toEqual(fullDefaults);
  });

  test("round-trips a single-field default through storage", () => {
    const json = serializeListingDefaults({ minimumDaysBefore: 3 });
    expect(json).toBe('{"minimumDaysBefore":3}');
    expect(parseListingDefaults(json)).toEqual({ minimumDaysBefore: 3 });
  });

  test("serialize persists only the configured keys", () => {
    expect(serializeListingDefaults({ hidden: true })).toBe('{"hidden":true}');
    expect(serializeListingDefaults({})).toBe("{}");
  });

  test("an absent setting parses to no defaults", () => {
    // The getter passes through whatever the snapshot holds; before any save
    // that is undefined (and an empty string for a cleared key).
    expect(parseListingDefaults(undefined)).toEqual({});
    expect(parseListingDefaults("")).toEqual({});
  });

  test("rejects malformed JSON and invalid stored fields", () => {
    expect(() => parseListingDefaults("{")).toThrow(
      /^Invalid stored JSON in settings\.listing_defaults:/,
    );
    expect(() => parseListingDefaults('{"bookableDays":["Monday",2]}')).toThrow(
      "Invalid stored JSON in settings.listing_defaults",
    );
    expect(() => parseListingDefaults('{"hidden":"yes"}')).toThrow(
      "Invalid stored JSON in settings.listing_defaults",
    );
    expect(() => parseListingDefaults('{"minimumDaysBefore":-1}')).toThrow();
    expect(() => parseListingDefaults('{"maximumDaysAfter":-1}')).toThrow();
  });

  test("allows zero-day booking windows", () => {
    expect(
      parseListingDefaults(
        serializeListingDefaults({
          maximumDaysAfter: 0,
          minimumDaysBefore: 0,
        }),
      ),
    ).toEqual({ maximumDaysAfter: 0, minimumDaysBefore: 0 });
  });

  test("names the setting when serialization rejects invalid defaults", () => {
    expect(() =>
      serializeListingDefaults({ hidden: "yes" } as unknown as ListingDefaults),
    ).toThrow(/^Invalid value for stored JSON in settings\.listing_defaults$/);
  });
});

describe("shared > listing-defaults > LISTING_DEFAULT_FIELDS", () => {
  test("every field maps a unique key and column", () => {
    const keys = LISTING_DEFAULT_FIELDS.map((f) => f.key);
    const fields = LISTING_DEFAULT_FIELDS.map((f) => f.field);
    expect(new Set(keys).size).toBe(keys.length);
    expect(new Set(fields).size).toBe(fields.length);
  });

  test("every field has a label and hint translation", () => {
    // The label/hint keys are built dynamically, so the static forward i18n
    // coverage scan can't verify them — adding a field without translations
    // (as `hidden` once was) would otherwise ship a raw key to the page. With
    // t() now throwing on a missing key, this guards the whole set at its source.
    const missing = LISTING_DEFAULT_FIELDS.flatMap((f) =>
      [listingDefaultLabelKey(f), listingDefaultHintKey(f)].filter(
        (key) => !(key in messages),
      ),
    );
    expect(missing).toEqual([]);
  });
});

describe("shared > listing-defaults > resolveListingDate", () => {
  test("a daily listing's date reads as empty", () => {
    const listing = testListing({
      date: "2020-06-15T18:00:00.000Z",
      listing_type: "daily",
    });
    expect(resolveListingDate(listing).date).toBe("");
  });

  test("a standard listing keeps its own date", () => {
    const listing = testListing({
      date: "2020-06-15T18:00:00.000Z",
      listing_type: "standard",
    });
    expect(resolveListingDate(listing)).toBe(listing);
  });

  test("a narrow row that never selected a date needs no overlay", () => {
    const narrow = { id: 1, listing_type: "daily" as const };
    expect(resolveListingDate(narrow)).toBe(narrow);
  });

  test("a narrow row selects listing_type beside date or cannot be resolved", () => {
    expect(() =>
      resolveListingDate({ date: "2020-06-15T18:00:00.000Z", id: 1 }),
    ).toThrow("listing_type");
  });
});
