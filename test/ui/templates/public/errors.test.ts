import { assert, assertStringIncludes } from "@std/assert";
import { beforeAll, describe, it as test } from "@std/testing/bdd";
import {
  databaseBusyPage,
  migrationInProgressPage,
  notFoundPage,
  qrBookCheckoutErrorPage,
  qrBookErrorPage,
  rateLimitedPage,
  siteNotActivatedPage,
  temporaryErrorPage,
} from "#templates/public/errors.tsx";
import { registerPublicTemplateHooks } from "#test/ui/templates/helpers.ts";
import { setupAdminPageTest } from "#test-utils/admin-page-test.ts";
import { expectIncludesAll } from "#test-utils/assertions.ts";

describe("notFoundPage", () => {
  beforeAll(setupAdminPageTest);
  registerPublicTemplateHooks();

  test("renders not found message", () => {
    const html = notFoundPage();
    assertStringIncludes(html, "<h1>Not Found</h1>");
  });
});

describe("temporaryErrorPage", () => {
  beforeAll(setupAdminPageTest);
  registerPublicTemplateHooks();

  test("renders error message with auto-refresh", () => {
    const html = temporaryErrorPage(true);
    expectIncludesAll(html, [
      "<h1>Temporary error</h1>",
      "Retrying automatically",
      'http-equiv="refresh"',
      'content="2"',
      "<style>",
      "font-family:system-ui",
    ]);
  });
  test("preserves uncertainty about the submission", () => {
    const html = temporaryErrorPage(false);
    assert(!html.includes('http-equiv="refresh"'));
    assert(!html.includes("Retrying automatically"));
    assert(!html.includes("your submission was not saved"));
    expectIncludesAll(html, [
      "Your changes may already be saved.",
      "Check the existing records or your booking before you submit again.",
      "font-family:system-ui",
    ]);
  });
});

describe("qrBookErrorPage", () => {
  beforeAll(setupAdminPageTest);
  registerPublicTemplateHooks();

  test("identifies a checkout failure and escapes the provider message", () => {
    const html = qrBookCheckoutErrorPage("summer-fete", "Failed <payment>");
    expectIncludesAll(html, [
      "<title>Could not start payment</title>",
      "<h1>Could not start your payment</h1>",
      "<p>Failed &lt;payment&gt;</p>",
      'href="/ticket/summer-fete"',
    ]);
  });

  test("offers the normal booking page when the listing has a slug", () => {
    const html = qrBookErrorPage("summer-fete");
    expectIncludesAll(html, [
      "<h1>QR code expired or invalid</h1>",
      "This QR code has expired",
      '<a href="/ticket/summer-fete">Go to booking page</a>',
    ]);
  });

  test("omits the booking link when there is no standalone page", () => {
    const html = qrBookErrorPage(null);
    assertStringIncludes(html, "This QR code has expired");
    assert(!html.includes("Go to booking page"));
    assert(!html.includes('href="/ticket/'));
  });
});

describe("rateLimitedPage", () => {
  beforeAll(setupAdminPageTest);
  registerPublicTemplateHooks();

  test("renders the too-many-requests message", () => {
    const html = rateLimitedPage();
    expectIncludesAll(html, [
      "<h1>Too Many Requests</h1>",
      "You've hit too many invalid ticket links.",
    ]);
  });
});

describe("databaseBusyPage", () => {
  beforeAll(setupAdminPageTest);
  registerPublicTemplateHooks();

  test("auto-refreshes and reassures when the method is idempotent", () => {
    const html = databaseBusyPage(true);
    expectIncludesAll(html, [
      "<h1>The database is too busy.</h1>",
      'http-equiv="refresh"',
      "Reloading so you can try again.",
    ]);
    assert(!html.includes("your submission was not saved"));
  });

  test("skips the refresh and asks to resubmit for non-idempotent methods", () => {
    const html = databaseBusyPage(false);
    assertStringIncludes(html, "<h1>The database is too busy.</h1>");
    assert(!html.includes('http-equiv="refresh"'));
    assertStringIncludes(
      html,
      "Please go back and try again — your submission was not saved.",
    );
    assert(!html.includes("Reloading so you can try again."));
  });
});

describe("readOnlyPage", () => {
  beforeAll(setupAdminPageTest);
  registerPublicTemplateHooks();

  // Set RENEWAL_URL through the worker-local overlay (not the shared process
  // env, which parallel test files read) and restore it afterwards.
});

describe("migrationInProgressPage", () => {
  beforeAll(setupAdminPageTest);
  registerPublicTemplateHooks();

  test("renders update message with auto-refresh", () => {
    const html = migrationInProgressPage();
    expectIncludesAll(html, [
      "<h1>Update In Progress</h1>",
      "backing up and updating the database",
      'http-equiv="refresh"',
      'content="5"',
      "<style>",
      "font-family:system-ui",
    ]);
  });

  test("does not present itself as an error", () => {
    const html = migrationInProgressPage();
    assert(!html.includes("<title>Error"));
    assert(!html.includes("<h1>Error"));
  });
});

describe("siteNotActivatedPage", () => {
  beforeAll(setupAdminPageTest);
  registerPublicTemplateHooks();

  test("renders not-activated message in the error dialog style", () => {
    const html = siteNotActivatedPage();
    expectIncludesAll(html, [
      '<div class="prose"><h1>Not Activated</h1><p>This site has not been activated yet.</p></div>',
      "<style>",
      "font-family:system-ui",
    ]);
  });

  test("does not auto-refresh", () => {
    const html = siteNotActivatedPage();
    assert(!html.includes('http-equiv="refresh"'));
  });
});
