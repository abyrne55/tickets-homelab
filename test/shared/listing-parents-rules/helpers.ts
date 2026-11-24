import type { EdgeListing } from "#shared/listing-parents-rules.ts";

/** A minimal compatible edge listing; `over` layers the field a test varies. */
export const edgeListing = (over: Partial<EdgeListing> = {}): EdgeListing => ({
  customisable_days: false,
  day_prices: {},
  duration_days: 1,
  id: 1,
  listing_type: "standard",
  min_quantity: 1,
  name: "Test",
  ...over,
});
