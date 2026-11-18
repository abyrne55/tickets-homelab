/**
 * The retired map-pin keys (la/lo) in the attendee PII blob. Blobs are
 * encrypted to the owner key, so a migration cannot strip them: old blobs
 * still carry them, they must keep reading, they are ignored, and a rebuilt
 * blob no longer has them.
 */

import { expect } from "@std/expect";
import { it as test } from "@std/testing/bdd";
import {
  buildPiiBlob,
  decryptPiiBlob,
  encryptPiiBlob,
  parsePiiBlob,
} from "#db/attendees/pii.ts";
import { settings } from "#db/settings.ts";
import { getTestPrivateKey } from "#test-utils/crypto.ts";
import { describeWithEnv } from "#test-utils/db.ts";

const basePii = {
  address: "10 Downing Street, LONDON, SW1A 2AA",
  email: "pin@example.com",
  name: "Pin Person",
  payment_id: "",
  phone: "",
  special_instructions: "",
  ticket_token: "tok_pin",
};

/** A blob as an older release stored it, with a map pin. */
const legacyBlobJson = (): string =>
  JSON.stringify({
    a: basePii.address,
    e: basePii.email,
    la: "57.147740",
    lo: "-2.096323",
    n: basePii.name,
    p: basePii.phone,
    pi: basePii.payment_id,
    s: basePii.special_instructions,
    t: basePii.ticket_token,
    v: 1,
  });

describeWithEnv("db > attendees > pii retired map pin", { db: true }, () => {
  test("a rebuilt blob carries no la/lo keys", () => {
    const blob = JSON.parse(buildPiiBlob(basePii));
    expect("la" in blob).toBe(false);
    expect("lo" in blob).toBe(false);
  });

  test("a blob saved with a pin still parses", () => {
    const parsed = parsePiiBlob(legacyBlobJson());
    expect(parsed.a).toBe(basePii.address);
  });

  test("a blob saved with a pin decrypts to its contact fields alone", async () => {
    const encrypted = await encryptPiiBlob(
      legacyBlobJson(),
      settings.publicKey,
    );
    const pii = await decryptPiiBlob(
      encrypted,
      await getTestPrivateKey(),
      true,
    );
    expect(pii.address).toBe(basePii.address);
    expect(pii.name).toBe(basePii.name);
    expect("lat" in pii).toBe(false);
    expect("lng" in pii).toBe(false);
  });
});
