/**
 * Routes that were removed on purpose: the unauthenticated demo reset, the
 * owner-only "Example data" page and the in-app full database wipe. Each must
 * stay a plain 404 even for a signed-in owner, so a merge from upstream cannot
 * quietly bring a wipe route back.
 */

import { expect } from "@std/expect";
import { describe, it as test } from "@std/testing/bdd";
import { handleRequest } from "#routes";
import { describeWithEnv } from "#test-utils/db.ts";
import { mockFormRequest, mockRequest } from "#test-utils/mocks.ts";
import { adminFormPost, adminGet } from "#test-utils/session.ts";

describeWithEnv("removed routes", { db: true }, () => {
  describe("/demo/reset", () => {
    test("GET is a 404", async () => {
      const response = await handleRequest(mockRequest("/demo/reset"));
      expect(response.status).toBe(404);
    });

    test("POST is a 404 and wipes nothing", async () => {
      const response = await handleRequest(
        mockFormRequest("/demo/reset", {
          confirm_phrase:
            "The site will be fully reset and all data will be lost.",
        }),
      );
      expect(response.status).toBe(404);
    });
  });

  describe("/admin/seeds", () => {
    test("GET is a 404 for an owner", async () => {
      const response = await adminGet("/admin/seeds");
      expect(response.status).toBe(404);
    });

    test("POST is a 404 for an owner", async () => {
      const { response } = await adminFormPost("/admin/seeds", {});
      expect(response.status).toBe(404);
    });
  });

  describe("POST /admin/settings/reset-database", () => {
    test("is a 404 for an owner", async () => {
      const { response } = await adminFormPost(
        "/admin/settings/reset-database",
        {
          confirm_phrase:
            "The site will be fully reset and all data will be lost.",
        },
      );
      expect(response.status).toBe(404);
    });
  });
});
