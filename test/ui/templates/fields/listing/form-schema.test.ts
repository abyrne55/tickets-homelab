import { assertStringIncludes } from "@std/assert";
import { expect } from "@std/expect";
import { describe, it as test } from "@std/testing/bdd";
import { t } from "#i18n";
import { getListingEditForm } from "#templates/fields/listing.ts";

describe("listing form schema", () => {
  test("derives every section from field declarations", () => {
    const form = getListingEditForm();
    expect(form.sections).toEqual([
      "basics",
      "tickets",
      "daily",
      "duration",
      "customisable",
      "options",
      "advanced",
    ]);
    expect(form.fields.every((field) => field.section !== undefined)).toBe(
      true,
    );
  });

  test("pairs customisable days with pay more so only one can hold", () => {
    // Checking either one disables the other and shows why; the save keeps
    // its refusal (`error.customisable_days_with_pay_more`) as the authority.
    const why = `data-exclusive-why="${t("error.customisable_days_with_pay_more")}"`;
    const html = getListingEditForm().section("customisable");
    expect(html).toMatch(
      /name="customisable_days"[^>]*data-exclusive-with="can_pay_more"/,
    );
    assertStringIncludes(html, why);

    const payMore = getListingEditForm().section("tickets");
    expect(payMore).toMatch(
      /name="can_pay_more"[^>]*data-exclusive-with="customisable_days"/,
    );
    assertStringIncludes(payMore, why);
  });
});
