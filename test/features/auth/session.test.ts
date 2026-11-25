import { expect } from "@std/expect";
import { it as test } from "@std/testing/bdd";
import { getAuthenticatedSession } from "#routes/auth.ts";
import { describeWithEnv } from "#test-utils/db.ts";
import { createTestManagerSession, testCookie } from "#test-utils/session.ts";

// ---------------------------------------------------------------------------
// AdminSession.settingsNagItems population
// ---------------------------------------------------------------------------

const getOwnerSession = async () => {
  const cookie = await testCookie();
  const request = new Request("http://localhost/admin/", {
    headers: { cookie },
  });
  const session = await getAuthenticatedSession(request);
  expect(session).not.toBeNull();
  return session!;
};

describeWithEnv("AuthSession.settingsNagItems", { db: true }, () => {
  test("owner session includes settingsNagItems computed via getSettingsNagItems", async () => {
    const session = await getOwnerSession();
    expect(session.adminLevel).toBe("owner");
    expect(session.settingsNagItems).toBeDefined();
    expect(Array.isArray(session.settingsNagItems)).toBe(true);
    expect(
      session.settingsNagItems!.every(
        (i) =>
          typeof i.id === "string" &&
          typeof i.label === "string" &&
          typeof i.href === "string",
      ),
    ).toBe(true);
  });

  test("non-owner session does NOT include settingsNagItems", async () => {
    const managerCookie = await createTestManagerSession();
    const request = new Request("http://localhost/admin/", {
      headers: { cookie: managerCookie },
    });
    const session = await getAuthenticatedSession(request);
    expect(session).not.toBeNull();
    expect(session!.adminLevel).toBe("manager");
    expect(session!.settingsNagItems).toBeUndefined();
  });
});
