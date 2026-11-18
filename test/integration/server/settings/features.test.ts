/**
 * Branch cover for the feature routes, beside the story
 * `@story:settings.turning-features-on-and-off`.
 *
 * The story owns the owner's journey through the rendered pages: the list and
 * its statuses, each feature explaining itself, the choice being kept, Site
 * publishing the public site, and a feature in use offering no choice.
 *
 * These own what a browser cannot reach or a story cannot be the only cover
 * of: who may open each address, a slug the site has no feature for, a send
 * only a crafted POST can make, the settings cache, what is left in the
 * settings table, and the race around disabling a feature in use.
 */

import type { InStatement } from "@libsql/client";
import { expect } from "@std/expect";
import { it as test } from "@std/testing/bdd";
import { stub } from "@std/testing/mock";
import { setAdminFeatureEnabled } from "#db/admin-features.ts";
import { getDb } from "#db/client.ts";
import { CONFIG_KEYS, settings } from "#db/settings.ts";
import { parseEnabledFeatures } from "#shared/admin-features.ts";
import {
  expectFlash,
  expectFlashRedirect,
  expectStatus,
  testRequiresAuth,
} from "#test-utils/assertions.ts";
import { statementSql } from "#test-utils/record-queries.ts";
import { adminFormPost, adminGet } from "#test-utils/session.ts";
import {
  describeAdminSettings,
  saveAModifier,
  storedFeatureEnabled,
} from "#test-utils/settings.ts";

const expectFeatureSaved = async (
  slug: string,
  enabled: boolean,
  message: string,
): Promise<void> => {
  const path = `/admin/features/${slug}`;
  const { response } = await adminFormPost(path, {
    enabled: String(enabled),
  });
  await expectFlashRedirect(path, message)(response);
};

const IN_USE_HELP =
  "This feature is in use. Remove its saved items before you disable it.";

describeAdminSettings(() => {
  testRequiresAuth("/admin/features/modifiers");
  testRequiresAuth("/admin/features/modifiers", {
    body: { enabled: "true" },
    method: "POST",
  });

  test("shows the feature table last on the settings page", async () => {
    const html = await (await adminGet("/admin/settings")).text();
    expect(html.indexOf("Features")).toBeGreaterThan(
      html.indexOf("Calendar feeds"),
    );
  });

  test("returns 404 for an unknown feature", async () => {
    expectStatus(404)(await adminGet("/admin/features/unknown"));
  });

  test("rejects a missing enabled choice", async () => {
    // The page always renders one radio already picked, so only a crafted send
    // can arrive with no choice at all.
    const { response } = await adminFormPost("/admin/features/money", {});
    expect(response.status).toBe(302);
    expectFlash(response, "Choose whether to enable this feature.", false);
    expect(settings.features.money).toBe(false);
  });

  test("caches the feature setting it just wrote", async () => {
    await expectFeatureSaved("money", true, "Money enabled.");
    expect(settings.features.money).toBe(true);
    const cached = settings.getCachedRaw(CONFIG_KEYS.ENABLED_FEATURES);
    if (cached === null) throw new Error("Feature setting was not cached");
    expect(parseEnabledFeatures(cached).money).toBe(true);
  });

  test("refuses a crafted send that would disable a feature in use", async () => {
    // The page offers no form at all while a feature is in use, so this send
    // is one no browser could have made. The story owns what that page shows.
    await saveAModifier();
    await setAdminFeatureEnabled("modifiers", true);

    const { response } = await adminFormPost("/admin/features/modifiers", {
      enabled: "false",
    });
    expect(response.status).toBe(302);
    expectFlash(response, IN_USE_HELP, false);
    expect(await storedFeatureEnabled("modifiers")).toBe(true);
  });

  test("keeps a feature enabled when its first record appears during disable", async () => {
    await setAdminFeatureEnabled("modifiers", true);
    const db = getDb();
    const originalExecute = db.execute.bind(db);
    let inserted = false;
    const executeStub = stub(db, "execute", async (statement: InStatement) => {
      const result = await originalExecute(statement);
      const sql = statementSql(statement);
      if (!inserted && sql.includes("SELECT json_object")) {
        inserted = true;
        await saveAModifier();
      }
      return result;
    });
    try {
      const { response } = await adminFormPost("/admin/features/modifiers", {
        enabled: "false",
      });
      expectFlash(response, IN_USE_HELP, false);
    } finally {
      executeStub.restore();
    }
    expect(await storedFeatureEnabled("modifiers")).toBe(true);
  });
});
