import { cachedAdminPage } from "#test-utils/assertions.ts";

/**
 * The guide page as the owner sees it by default.
 *
 * The guide's default rendering is identical in every test (static help
 * content from the standard fixture), so it is rendered once and shared by
 * every test file that imports this module. Only tests that alter host config,
 * settings, or env fetch their own copy (e.g. via `assertAdminHtml`) so they
 * never read the stale snapshot.
 */
const cachedGuide = cachedAdminPage("/admin/guide");

export const guide = (
  ...expected: Parameters<typeof cachedGuide>
): Promise<string> => cachedGuide(...expected);
