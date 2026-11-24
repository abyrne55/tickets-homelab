import { assertStringIncludes } from "@std/assert";
import { it as test } from "@std/testing/bdd";
import { formatBytes } from "#shared/format-units.ts";
import { MAX_IMAGE_SIZE } from "#shared/limits.ts";
import { renderGuideSections } from "#templates/admin/guide/components.tsx";
import { domainsSections } from "#templates/admin/guide/domains.tsx";

test("states the header image size limit the site actually uses", () => {
  const html = String(renderGuideSections(domainsSections()));
  assertStringIncludes(html, `up to ${formatBytes(MAX_IMAGE_SIZE)} in size`);
});
