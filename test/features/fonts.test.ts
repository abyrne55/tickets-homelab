/** The /fonts/:file route: self-hosted WOFF2 files, allow-listed by name. */

import { assert } from "@std/assert";
import { expect } from "@std/expect";
import { it as test } from "@std/testing/bdd";
import { handleRequest } from "#routes";
import { FONT_FILES } from "#routes/assets.ts";
import { describeWithEnv } from "#test-utils/db.ts";
import { mockRequest } from "#test-utils/mocks.ts";

describeWithEnv("GET /fonts/:file", { db: true }, () => {
  test("serves each allow-listed font as immutable WOFF2", async () => {
    for (const file of FONT_FILES) {
      const response = await handleRequest(mockRequest(`/fonts/${file}`));
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toBe("font/woff2");
      expect(response.headers.get("cache-control")).toContain("immutable");
      const bytes = new Uint8Array(await response.arrayBuffer());
      // WOFF2 magic number: "wOF2".
      expect([...bytes.slice(0, 4)]).toEqual([0x77, 0x4f, 0x46, 0x32]);
    }
  });

  test("404s for any name outside the allow-list", async () => {
    for (const name of [
      "nope.woff2",
      "..%2Fstyle.css",
      "LICENSE-figtree.txt",
    ]) {
      const response = await handleRequest(mockRequest(`/fonts/${name}`));
      assert(response.status === 404, name);
    }
  });

  test("allows the fonts under the content security policy", async () => {
    const response = await handleRequest(mockRequest("/"));
    const csp = response.headers.get("content-security-policy") ?? "";
    assert(csp.includes("default-src 'self'"));
  });
});
