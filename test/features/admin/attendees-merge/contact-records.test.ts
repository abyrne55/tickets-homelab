import { expect } from "@std/expect";
import { it as test } from "@std/testing/bdd";
import { queryOne } from "#db/client.ts";
import { contactHash, forgetContact } from "#db/contact-preferences.ts";
import { expectFlash } from "#test-utils/assertions.ts";
import { mergePair, submitMerge } from "#test-utils/attendees/merge.ts";
import { describeWithEnv } from "#test-utils/db.ts";

/** The number of contact records stored for one contact hash. */
const contactRows = async (hash: string): Promise<number> => {
  const row = await queryOne<{ n: number }>(
    "SELECT COUNT(*) AS n FROM contact_preferences WHERE contact_hash = ?",
    [hash],
  );
  return row!.n;
};

describeWithEnv(
  "server (admin attendees) > merge contact records",
  { db: true },
  () => {
    test("an unchanged contact keeps its record untouched during the merge", async () => {
      const { sourceToken, target } = await mergePair({
        source: { email: "jane@example.com" },
      });
      const hash = await contactHash("email", "jane@example.com");
      expect(await contactRows(hash)).toBe(1);
      const blob = async (): Promise<string | null> =>
        (
          await queryOne<{ b: string | null }>(
            "SELECT attendee_tokens_blob AS b FROM contact_preferences WHERE contact_hash = ?",
            [hash],
          )
        )?.b ?? null;
      const before = await blob();

      const { response } = await submitMerge(target.id, sourceToken);
      expectFlash(response, expect.stringContaining("Merged"), true);

      expect(await blob()).toBe(before);
    });

    test("a forgotten contact is not recreated by an unchanged merge", async () => {
      const { sourceToken, target } = await mergePair({
        source: { email: "jane@example.com" },
      });
      const hash = await contactHash("email", "jane@example.com");
      expect(await forgetContact(hash)).toBe(1);

      const { response } = await submitMerge(target.id, sourceToken);
      expectFlash(response, expect.stringContaining("Merged"), true);

      expect(await contactRows(hash)).toBe(0);
    });
  },
);
