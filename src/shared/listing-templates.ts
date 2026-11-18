/**
 * A listing's "type" is inferred from three stored dimensions, with no DB column
 * of its own:
 *
 *   daily        listing_type === "daily"
 *   dated        date field non-empty
 *   purchaseable purchase_only (the "No check-in" flag)
 *
 * A listing that matches no named template is "Custom": full form, no fields
 * hidden.
 */

import type { Listing } from "#types";

export type TemplateId = "online-digital" | "one-off-event" | "weekly-event";

export type Dimensions = {
  daily: boolean;
  dated: boolean;
  purchaseable: boolean;
};

export type TemplateSignature = {
  /** Undefined means "don't care". */
  daily?: boolean;
  /** Undefined means "don't care" — only checked when daily is pinned false. */
  dated?: boolean;
  purchaseable: boolean;
};

export type ListingTemplate = {
  /** i18n key for the picker card description. */
  description: string;
  id: TemplateId;
  /** i18n key for the picker card title. */
  label: string;
  requiresDate: boolean;
  signature: TemplateSignature;
};

export const LISTING_TEMPLATES: readonly ListingTemplate[] = [
  {
    description: "listings_table.template_one_off_event_description",
    id: "one-off-event",
    label: "listings_table.template_one_off_event",
    requiresDate: true,
    signature: {
      daily: false,
      dated: true,
      purchaseable: false,
    },
  },
  {
    description: "listings_table.template_weekly_event_description",
    id: "weekly-event",
    label: "listings_table.template_weekly_event",
    requiresDate: false,
    signature: { daily: true, purchaseable: false },
  },
  {
    description: "listings_table.template_online_digital_description",
    id: "online-digital",
    label: "listings_table.template_online_digital",
    requiresDate: false,
    signature: {
      daily: false,
      dated: false,
      purchaseable: true,
    },
  },
];

export type DimensionSource = Pick<
  Listing,
  "date" | "listing_type" | "purchase_only"
>;

export const dimensionsOf = (source: DimensionSource): Dimensions => ({
  daily: source.listing_type === "daily",
  dated: source.date !== "",
  purchaseable: source.purchase_only,
});

const matchesSignature = (
  signature: TemplateSignature,
  dims: Dimensions,
): boolean => {
  if (signature.daily !== undefined && signature.daily !== dims.daily)
    return false;
  // dated is only meaningful when daily is explicitly pinned to false.
  if (
    signature.daily === false &&
    signature.dated !== undefined &&
    signature.dated !== dims.dated
  )
    return false;
  if (signature.purchaseable !== dims.purchaseable) return false;
  return true;
};

export const inferTemplate = (
  source: DimensionSource,
): ListingTemplate | null =>
  LISTING_TEMPLATES.find((tmpl) =>
    matchesSignature(tmpl.signature, dimensionsOf(source)),
  ) ?? null;

/**
 * Both halves of the condition are needed. The template choice alone would
 * reject the Custom card's legitimate unnamed shape. The submitted dimensions
 * alone would be vacuous, because a blank date never infers one-off.
 *
 * Together they distinguish "forgot the date" from "different type".
 */
export const submissionRequiresDate = (
  chosenTemplateId: string | null,
  submittedDimensions: Dimensions,
): boolean =>
  chosenTemplateId === "one-off-event" &&
  !submittedDimensions.daily &&
  !submittedDimensions.purchaseable;
