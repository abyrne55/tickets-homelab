import { expect } from "@std/expect";
import { describe, test } from "@std/testing/bdd";
import {
  type Dimensions,
  dimensionsOf,
  inferTemplate,
  LISTING_TEMPLATES,
  submissionRequiresDate,
  type TemplateId,
} from "#shared/listing-templates.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal DimensionSource from raw booleans. */
const src = (daily: boolean, dated: boolean, purchaseable: boolean) => ({
  date: dated ? "2024-06-01T10:00:00Z" : "",
  listing_type: (daily ? "daily" : "standard") as "daily" | "standard",
  purchase_only: purchaseable,
});

const dims = (
  daily: boolean,
  dated: boolean,
  purchaseable: boolean,
): Dimensions => ({ daily, dated, purchaseable });

// ---------------------------------------------------------------------------
// dimensionsOf
// ---------------------------------------------------------------------------

describe("dimensionsOf", () => {
  test("maps listing_type=daily to daily=true", () => {
    expect(dimensionsOf(src(true, false, false)).daily).toBe(true);
  });

  test("maps listing_type=standard to daily=false", () => {
    expect(dimensionsOf(src(false, false, false)).daily).toBe(false);
  });

  test("maps non-empty date to dated=true", () => {
    expect(dimensionsOf(src(false, true, false)).dated).toBe(true);
  });

  test("maps empty date to dated=false", () => {
    expect(dimensionsOf(src(false, false, false)).dated).toBe(false);
  });

  test("maps purchase_only to purchaseable", () => {
    expect(dimensionsOf(src(false, false, true)).purchaseable).toBe(true);
    expect(dimensionsOf(src(false, false, false)).purchaseable).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// inferTemplate — exhaustive table over all 8 (daily×dated×purchaseable) combos
// ---------------------------------------------------------------------------

// Expected inference: 4 of 8 combos map to a named template.
//
//  Key: [daily, dated, purchaseable] → expected TemplateId | null
//
//  one-off-event   : daily=false, dated=true,  purch=false     (×1)
//  weekly-event    : daily=true,  dated=?,      purch=false     (×2)
//  online-digital  : daily=false, dated=false,  purch=true      (×1)
//  null (Custom)   : all other combos                           (×4)
const TABLE: Array<{
  combo: [boolean, boolean, boolean];
  expected: TemplateId | null;
}> = [
  { combo: [false, false, false], expected: null },
  { combo: [false, true, false], expected: "one-off-event" },
  { combo: [false, false, true], expected: "online-digital" },
  { combo: [false, true, true], expected: null },
  { combo: [true, false, false], expected: "weekly-event" },
  { combo: [true, true, false], expected: "weekly-event" }, // dated ignored for daily
  { combo: [true, false, true], expected: null },
  { combo: [true, true, true], expected: null },
];

describe("inferTemplate — all 8 dimension combos", () => {
  for (const { combo, expected } of TABLE) {
    const [daily, dated, purchaseable] = combo;
    const label = `(daily=${daily}, dated=${dated}, purch=${purchaseable})`;
    test(`${label} → ${expected ?? "null (Custom)"}`, () => {
      expect(inferTemplate(src(daily, dated, purchaseable))?.id ?? null).toBe(
        expected,
      );
    });
  }
});

describe("inferTemplate — mutual exclusivity", () => {
  test("no combo maps to more than one template", () => {
    for (const { combo } of TABLE) {
      const [daily, dated, purchaseable] = combo;
      const matches = LISTING_TEMPLATES.filter(
        (tmpl) =>
          inferTemplate(src(daily, dated, purchaseable))?.id === tmpl.id,
      );
      expect(matches.length).toBeLessThanOrEqual(1);
    }
  });

  test("exactly 4 of 8 combos match a named template", () => {
    const matched = TABLE.filter(({ expected }) => expected !== null);
    expect(matched).toHaveLength(4);
  });
});

describe("inferTemplate — dated asymmetry for daily types", () => {
  test("weekly-event matches daily=true regardless of dated", () => {
    expect(inferTemplate(src(true, false, false))?.id).toBe("weekly-event");
    expect(inferTemplate(src(true, true, false))?.id).toBe("weekly-event");
  });
});

describe("inferTemplate — price is not a dimension", () => {
  test("one-off-event infers regardless of unit_price", () => {
    // DimensionSource does not include unit_price; pricing is orthogonal.
    const base = src(false, true, false);
    expect(inferTemplate(base)?.id).toBe("one-off-event");
    // Adding extra fields to the source doesn't affect inference.
    expect(inferTemplate({ ...base, unit_price: 0 } as typeof base)?.id).toBe(
      "one-off-event",
    );
    expect(
      inferTemplate({ ...base, unit_price: 1000 } as typeof base)?.id,
    ).toBe("one-off-event");
  });
});

describe("inferTemplate — template flags", () => {
  test("only one-off-event requires a date", () => {
    const dateRequired = LISTING_TEMPLATES.filter((t) => t.requiresDate);
    expect(dateRequired.map((t) => t.id)).toEqual(["one-off-event"]);
  });

  test("the hireable-item template is gone", () => {
    expect(LISTING_TEMPLATES.map((t) => t.id)).not.toContain("hireable-item");
  });

  test("all templates have label and description i18n keys", () => {
    for (const tmpl of LISTING_TEMPLATES) {
      expect(tmpl.label).toMatch(/^listings_table\./);
      expect(tmpl.description).toMatch(/^listings_table\./);
    }
  });

  // Pins the exact key per template — the prefix check above would still
  // pass on a typo'd or truncated key (e.g. an appended suffix). i18n's t()
  // throws on an unknown key rather than degrading silently, but that only
  // protects a key that actually gets rendered in some test.
  const EXPECTED_KEYS: Record<
    TemplateId,
    { label: string; description: string }
  > = {
    "one-off-event": {
      description: "listings_table.template_one_off_event_description",
      label: "listings_table.template_one_off_event",
    },
    "online-digital": {
      description: "listings_table.template_online_digital_description",
      label: "listings_table.template_online_digital",
    },
    "weekly-event": {
      description: "listings_table.template_weekly_event_description",
      label: "listings_table.template_weekly_event",
    },
  };

  for (const tmpl of LISTING_TEMPLATES) {
    test(`${tmpl.id} has its exact label and description i18n key`, () => {
      expect({ description: tmpl.description, label: tmpl.label }).toEqual(
        EXPECTED_KEYS[tmpl.id],
      );
    });
  }
});

// ---------------------------------------------------------------------------
// submissionRequiresDate — truth table
// ---------------------------------------------------------------------------

describe("submissionRequiresDate", () => {
  // The condition fires ONLY when:
  //   chosenTemplateId === "one-off-event"  AND
  //   daily=false AND purchaseable=false

  test("returns true for the one-off-event shape", () => {
    expect(
      submissionRequiresDate("one-off-event", dims(false, false, false)),
    ).toBe(true);
  });

  test("returns true even when dated=true (function checks only non-date dims)", () => {
    // dated is not checked — the caller separately tests if date is blank.
    expect(
      submissionRequiresDate("one-off-event", dims(false, true, false)),
    ).toBe(true);
  });

  test("returns false when chosenTemplateId is null", () => {
    expect(submissionRequiresDate(null, dims(false, false, false))).toBe(false);
  });

  test("returns false for a different template id", () => {
    expect(
      submissionRequiresDate("weekly-event", dims(false, false, false)),
    ).toBe(false);
  });

  test("returns false for an unknown template id string", () => {
    expect(submissionRequiresDate("custom", dims(false, false, false))).toBe(
      false,
    );
  });

  test("returns false when daily=true (operator changed to weekly shape)", () => {
    expect(
      submissionRequiresDate("one-off-event", dims(true, false, false)),
    ).toBe(false);
  });

  test("returns false when purchaseable=true (operator changed shape)", () => {
    expect(
      submissionRequiresDate("one-off-event", dims(false, false, true)),
    ).toBe(false);
  });
});
