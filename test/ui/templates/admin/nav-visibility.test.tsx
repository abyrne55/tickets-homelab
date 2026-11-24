import { assert, assertStringIncludes } from "@std/assert";
import { expect } from "@std/expect";
import { it as test } from "@std/testing/bdd";
import { AdminNav } from "#templates/admin/nav.tsx";
import { expectIncludesAll } from "#test-utils/assertions.ts";
import { describeWithEnv } from "#test-utils/db.ts";
import { withStorageDisabled, withStorageEnabled } from "#test-utils/mocks.ts";
import {
  featureSetting,
  useSetting,
  withSetting,
} from "#test-utils/settings.ts";

/** The first desktop sub-nav's HTML, for asserting a link sits inside it. */
const subNav = (html: string): string => {
  const start = html.indexOf('class="admin-subnav"');
  expect(start).toBeGreaterThan(-1);
  return html.slice(start, html.indexOf("</ul>", start));
};

/** Which sections and links each role, feature flag, and host setting makes
 * visible. The structural tests (highlighting, sub-nav nesting, create-link
 * machinery) live in nav.test.tsx. */
describeWithEnv("AdminNav visibility", {}, () => {
  useSetting(featureSetting("money", "site"));

  test("AdminNav hides optional features when they are disabled", async () => {
    await withSetting(featureSetting(), () => {
      const html = String(
        AdminNav({ active: "/admin/", session: { adminLevel: "owner" } }),
      );
      for (const href of [
        "/admin/servicing",
        "/admin/modifiers",
        "/admin/ledger",
      ]) {
        assert(!html.includes(`href="${href}"`), href);
      }
      assertStringIncludes(html, 'href="/admin/attendees"');
    });
  });

  test("AdminNav hides feature links inside Users and Settings", async () => {
    await withSetting(featureSetting(), () => {
      const users = String(
        AdminNav({ active: "/admin/users", session: { adminLevel: "owner" } }),
      );
      const settings = String(
        AdminNav({
          active: "/admin/settings",
          session: { adminLevel: "owner" },
        }),
      );
      assert(!users.includes('href="/admin/api-keys"'));
      assert(!settings.includes('href="/admin/attributes"'));
      assert(!settings.includes('href="/admin/questions"'));
    });
  });

  test("AdminNav shows Money to owners but not managers", () => {
    const ownerHtml = String(
      AdminNav({ active: "/admin/", session: { adminLevel: "owner" } }),
    );
    expectIncludesAll(ownerHtml, ['href="/admin/ledger"', "Money"]);
    assert(!ownerHtml.includes("Money history"));
    const managerHtml = String(
      AdminNav({ active: "/admin/", session: { adminLevel: "manager" } }),
    );
    assert(!managerHtml.includes('href="/admin/ledger"'));
  });

  test("owner sees a top-level Site link when Site is enabled", () => {
    const html = String(
      AdminNav({ active: "/admin/", session: { adminLevel: "owner" } }),
    );
    assertStringIncludes(html, 'href="/admin/site"');
  });

  test("owner does not see Site when Site is disabled", () =>
    withSetting(featureSetting(), () => {
      const html = String(
        AdminNav({ active: "/admin/", session: { adminLevel: "owner" } }),
      );
      assert(!html.includes('href="/admin/site"'));
    }));

  test("Site routes stay out of the nav while Site is disabled", () =>
    withSetting(featureSetting(), () => {
      for (const active of ["/admin/site", "/admin/site/contact"]) {
        const html = String(
          AdminNav({ active, session: { adminLevel: "owner" } }),
        );
        assert(!html.includes('href="/admin/site"'), active);
        assert(!html.includes('href="/admin/site/contact"'), active);
      }
    }));

  test("managers never see the Site link", () => {
    for (const adminLevel of ["manager"] as const) {
      const html = String(
        AdminNav({ active: "/admin/", session: { adminLevel } }),
      );
      assert(!html.includes('href="/admin/site"'), adminLevel);
    }
  });

  test("the Site section sub-nav shows for owner and editor on /admin/site", () => {
    for (const adminLevel of ["owner", "editor"] as const) {
      const html = String(
        AdminNav({ active: "/admin/site", session: { adminLevel } }),
      );
      expectIncludesAll(html, [
        'href="/admin/site/contact"',
        'href="/admin/site/order"',
      ]);
    }
  });

  test("editors get no section sub-nav away from the Site editor", () => {
    const html = String(
      AdminNav({
        active: "/admin/listings",
        session: { adminLevel: "editor" },
      }),
    );
    assert(!html.includes('href="/admin/site/contact"'));
  });

  test("the Images section sub-nav offers an Add link when storage is enabled", () =>
    withStorageEnabled(() => {
      const html = String(
        AdminNav({ active: "/admin/images", session: { adminLevel: "owner" } }),
      );
      assertStringIncludes(html, 'href="/admin/images/new"');
      const sub = subNav(html);
      expectIncludesAll(sub, ['href="/admin/images/new"', "Add"]);
    }));

  test("editors see the Images Add sub-nav link too when storage is enabled", () =>
    withStorageEnabled(() => {
      const html = String(
        AdminNav({
          active: "/admin/images",
          session: { adminLevel: "editor" },
        }),
      );
      assertStringIncludes(html, 'href="/admin/images/new"');
    }));

  test("the Images section is absent when storage is disabled", () =>
    withStorageDisabled(() => {
      const html = String(
        AdminNav({ active: "/admin/images", session: { adminLevel: "owner" } }),
      );
      assert(!html.includes('href="/admin/images/new"'));
    }));

  test("Guide stays hidden from editors and scanners", () => {
    for (const adminLevel of ["editor", "scanner"] as const) {
      const html = String(
        AdminNav({ active: "/admin/", session: { adminLevel } }),
      );
      assert(!html.includes('href="/admin/guide"'), adminLevel);
    }
  });
});
