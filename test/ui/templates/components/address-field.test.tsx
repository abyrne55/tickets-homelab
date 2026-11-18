import { assertStringIncludes } from "@std/assert";
import { describe, it as test } from "@std/testing/bdd";
import { MAX_INPUT_LENGTH } from "#shared/limits.ts";
import { AddressField } from "#templates/components/address-field.tsx";

describe("AddressField", () => {
  const address = "12 Main Road, Leeds, LS1 1AA";

  test("renders the address textarea with its label and the input cap", () => {
    const html = String(AddressField({ address }));

    // The textarea body opens with one spare newline for HTML parsing,
    // which eats the first newline after a `<textarea>` start tag.
    assertStringIncludes(
      html,
      `<label for="address">Address<textarea autocomplete="off" id="address" maxlength="${MAX_INPUT_LENGTH}" name="address" rows="3">\n${address}</textarea></label>`,
    );
  });

  test("renders an empty textarea for a blank address", () => {
    const html = String(AddressField({ address: "" }));

    assertStringIncludes(
      html,
      `maxlength="${MAX_INPUT_LENGTH}" name="address" rows="3">\n</textarea>`,
    );
  });
});
