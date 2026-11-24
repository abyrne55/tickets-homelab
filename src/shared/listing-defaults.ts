// effects: pure
/**
 * Inheritance happens at READ time, so changing a default instantly changes
 * every "Use defaults" listing. The row's own value for a defaulted field is
 * ignored while the flag is on.
 *
 * Inheritance is one per-listing flag, never per-field. A per-field toggle is
 * ambiguous for a field whose own value is `false` or empty: an override, or
 * just unset? So the whole set moves together.
 *
 * This module is pure.
 */

import * as v from "valibot";
import { VALID_DAY_NAMES } from "#shared/day-names.ts";
import { integerAtLeast } from "#shared/validation/number.ts";
import { defineStoredJson } from "#shared/validation/stored-json.ts";
import type { Listing } from "#types";

/**
 * The operator-configurable defaults. A key is present only when a default is
 * set; an absent key means "no default — never override".
 */
export const ListingDefaultsSchema = v.strictObject({
  bookableDays: v.optional(v.array(v.picklist(VALID_DAY_NAMES))),
  hidden: v.optional(v.boolean()),
  maximumDaysAfter: v.optional(integerAtLeast(0)),
  minimumDaysBefore: v.optional(integerAtLeast(0)),
  showRemaining: v.optional(v.boolean()),
  thankYouUrl: v.optional(v.string()),
  webhookUrl: v.optional(v.string()),
});
export type ListingDefaults = v.InferOutput<typeof ListingDefaultsSchema>;
const listingDefaultsJson = defineStoredJson(ListingDefaultsSchema);

/** How a default is stored, validated, and rendered. */
export type ListingDefaultKind = "bool" | "number" | "url" | "days";

/**
 * A row the overlay can resolve: it must carry the inheritance flag, and it
 * inherits whichever defaultable fields it actually selected. A narrow read
 * that selects only some of them gets only those overlaid — see
 * {@link resolveListingDefaults}.
 */
export type ResolvableListing = Partial<Listing> & { use_defaults: boolean };

export type ListingDefaultField = {
  /** Key in {@link ListingDefaults}. */
  key: keyof ListingDefaults;
  /** Matching listing column / listing-form field name (snake_case). */
  field: keyof Listing;
  kind: ListingDefaultKind;
};

/**
 * `duration_days` and `customisable_days` are excluded outright, because both
 * are tied to save-time invariants that read-time inheritance cannot honour.
 */
export const LISTING_DEFAULT_FIELDS: readonly ListingDefaultField[] = [
  { field: "bookable_days", key: "bookableDays", kind: "days" },
  { field: "minimum_days_before", key: "minimumDaysBefore", kind: "number" },
  { field: "maximum_days_after", key: "maximumDaysAfter", kind: "number" },
  { field: "webhook_url", key: "webhookUrl", kind: "url" },
  { field: "thank_you_url", key: "thankYouUrl", kind: "url" },
  { field: "show_remaining", key: "showRemaining", kind: "bool" },
  { field: "hidden", key: "hidden", kind: "bool" },
] as const;

/** The HTML form input name for a field's default value. */
export const listingDefaultInputName = (field: ListingDefaultField): string =>
  `default_${field.field}`;

/** The i18n key for one field's label or hint text. */
const listingDefaultTextKey =
  (suffix: "label" | "hint") =>
  (field: ListingDefaultField): string =>
    `listing_defaults.field.${field.field}.${suffix}`;

export const listingDefaultLabelKey = listingDefaultTextKey("label");

export const listingDefaultHintKey = listingDefaultTextKey("hint");

/** A kebab-case CSS marker class per field (e.g. `show_remaining` →
 * `listing-form--default-show-remaining`). */
export const listingDefaultFieldClass = (field: keyof Listing): string =>
  `listing-form--default-${String(field).replace(/_/g, "-")}`;

/** The fields that currently have a default set, in display order. */
export const setListingDefaultFields = (
  defaults: ListingDefaults,
): ListingDefaultField[] =>
  LISTING_DEFAULT_FIELDS.filter(({ key }) => defaults[key] !== undefined);

/** Whether any default is configured (drives the form toggle's presence). */
export const hasAnyListingDefault = (defaults: ListingDefaults): boolean =>
  setListingDefaultFields(defaults).length > 0;

/** One marker class per set default, so CSS can hide each defaulted field while
 * "Use defaults" is on. */
export const listingDefaultFormClasses = (defaults: ListingDefaults): string =>
  setListingDefaultFields(defaults)
    .map(({ field }) => listingDefaultFieldClass(field))
    .join(" ");

/**
 * Resolve a listing's effective values: when `use_defaults` is on, overlay each
 * set default; otherwise return it unchanged.
 *
 * A field the row did not select cannot be inherited, so a narrow read gets the
 * effective values of exactly the fields it asked for.
 */
export const resolveListingDefaults = <T extends ResolvableListing>(
  listing: T,
  defaults: ListingDefaults,
): T => {
  if (!listing.use_defaults) return listing;
  const overlay: Partial<Record<keyof Listing, unknown>> = {};
  for (const { key, field } of setListingDefaultFields(defaults)) {
    if (field in listing) overlay[field] = defaults[key];
  }
  return { ...listing, ...overlay };
};

/**
 * A daily listing has no single date — the attendee picks one per booking — so
 * its stored `date` reads as empty on every surface. The overlay works at read
 * time on the values a row selected, like {@link resolveListingDefaults}. The
 * stored row keeps its date, so switching the type back to standard brings it
 * back. A row that selects `date` must also select `listing_type`, the value
 * this rule reads.
 */
export const resolveListingDate = <T extends Partial<Listing>>(
  listing: T,
): T => {
  if (!("date" in listing)) return listing;
  if (!("listing_type" in listing)) {
    throw new Error(
      "Cannot resolve the listing date: the row selects it but not listing_type, which its rule reads",
    );
  }
  return listing.listing_type === "daily" ? { ...listing, date: "" } : listing;
};

/**
 * Parse the stored JSON blob into a {@link ListingDefaults}. The blob is only
 * ever written by {@link serializeListingDefaults}, so its shape is trusted; an
 * absent setting (no defaults configured yet) reads as `{}`.
 */
export const parseListingDefaults = (
  raw: string | undefined,
): ListingDefaults =>
  raw ? listingDefaultsJson.read(raw, "settings.listing_defaults") : {};

/** Serialize defaults for storage. `JSON.stringify` drops every unset
 * (`undefined`) key, so only configured defaults are persisted. */
export const serializeListingDefaults = (defaults: ListingDefaults): string =>
  listingDefaultsJson.write(defaults, "settings.listing_defaults");
