/**
 * Routes that were removed on purpose: the unauthenticated demo reset, the
 * owner-only "Example data" page, the in-app full database wipe, and the
 * hosting platform's pages (renewals, built sites, the site builder,
 * self-update, support, the superuser and custom-domain settings). Each must
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

  describe("address lookup", () => {
    test("GET /address-lookup is a 404", async () => {
      const response = await handleRequest(
        mockRequest("/address-lookup?q=SW1A1AA"),
      );
      expect(response.status).toBe(404);
    });

    test("POST /admin/settings/address-lookup is a 404 for an owner", async () => {
      const { response } = await adminFormPost(
        "/admin/settings/address-lookup",
        { address_lookup_provider: "easypostcodes" },
      );
      expect(response.status).toBe(404);
    });
  });

  describe("logistics", () => {
    test("GET /admin/deliveries is a 404 for an owner", async () => {
      const response = await adminGet("/admin/deliveries");
      expect(response.status).toBe(404);
    });

    test("GET /admin/logistics is a 404 for an owner", async () => {
      const response = await adminGet("/admin/logistics");
      expect(response.status).toBe(404);
    });

    test("GET /logistics-map.js is a 404", async () => {
      const response = await handleRequest(mockRequest("/logistics-map.js"));
      expect(response.status).toBe(404);
    });

    test("POST /admin/settings/logistics-run-sheet is a 404 for an owner", async () => {
      const { response } = await adminFormPost(
        "/admin/settings/logistics-run-sheet",
        { body: "x", heading: "y" },
      );
      expect(response.status).toBe(404);
    });
  });

  describe("hosting platform", () => {
    test("GET /renew is a 404", async () => {
      const response = await handleRequest(mockRequest("/renew"));
      expect(response.status).toBe(404);
    });

    test("GET /instance/site-credentials is a 404", async () => {
      const response = await handleRequest(
        mockRequest("/instance/site-credentials"),
      );
      expect(response.status).toBe(404);
    });

    for (const path of [
      "/admin/built-sites",
      "/admin/built-sites/1",
      "/admin/builder",
      "/admin/update",
      "/admin/support",
      "/admin/settings/superuser",
    ]) {
      test(`GET ${path} is a 404 for an owner`, async () => {
        const response = await adminGet(path);
        expect(response.status).toBe(404);
      });
    }

    for (const path of [
      "/admin/update/check",
      "/admin/settings/superuser",
      "/admin/settings/custom-domain",
      "/admin/settings/custom-domain/validate",
      "/admin/settings/host-subdomain",
    ]) {
      test(`POST ${path} is a 404 for an owner`, async () => {
        const { response } = await adminFormPost(path, { x: "y" });
        expect(response.status).toBe(404);
      });
    }
  });
});
