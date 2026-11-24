import { expect } from "@std/expect";
import { describe, it as test } from "@std/testing/bdd";
import { decrypt } from "#crypto/encryption.ts";
import type { WrappedKey } from "#crypto/sealed.ts";
import { CONFIG_KEYS, settings } from "#db/settings.ts";
import { getUserByUsername, verifyUserPassword } from "#db/users.ts";
import { DEFAULT_ORPHAN_RETENTION } from "#shared/orphan-retention.ts";
import { describeWithEnv } from "#test-utils/db.ts";
import {
  TEST_ADMIN_PASSWORD,
  TEST_ADMIN_USERNAME,
} from "#test-utils/internal.ts";

describeWithEnv("db > settings", { db: true }, () => {
  describe("generated string accessors", () => {
    test("read and write registry-backed plaintext and encrypted settings", async () => {
      await settings.update.customCss("body { color: red; }");
      await settings.update.businessEmail("owner@example.com");
      settings.invalidateCache();

      await settings.loadKeys([
        CONFIG_KEYS.CUSTOM_CSS,
        CONFIG_KEYS.BUSINESS_EMAIL,
      ]);

      expect(settings.customCss).toBe("body { color: red; }");
      expect(settings.businessEmail).toBe("owner@example.com");
      expect(settings.getCachedRaw(CONFIG_KEYS.CUSTOM_CSS)).toBe(
        "body { color: red; }",
      );
      expect(settings.getCachedRaw(CONFIG_KEYS.BUSINESS_EMAIL)).toMatch(
        /^enc:1:/,
      );
    });

    test("keeps read-only registry settings out of the update API", () => {
      expect("publicKey" in settings.update).toBe(false);
      expect("wrappedPrivateKey" in settings.update).toBe(false);
    });
  });

  describe("additional settings", () => {
    test("loadKeys sets theme to dark when stored value is dark", async () => {
      await settings.setRaw(CONFIG_KEYS.THEME, "dark");
      settings.invalidateCache();
      await settings.loadKeys([CONFIG_KEYS.THEME]);
      expect(settings.theme).toBe("dark");
    });

    test("loadKeys sets underlineLinks true when stored value is true", async () => {
      await settings.setRaw(CONFIG_KEYS.UNDERLINE_LINKS, "true");
      settings.invalidateCache();
      await settings.loadKeys([CONFIG_KEYS.UNDERLINE_LINKS]);
      expect(settings.underlineLinks).toBe(true);
    });

    test("loadKeys leaves underlineLinks false when stored value is not true", async () => {
      await settings.setRaw(CONFIG_KEYS.UNDERLINE_LINKS, "false");
      settings.invalidateCache();
      await settings.loadKeys([CONFIG_KEYS.UNDERLINE_LINKS]);
      expect(settings.underlineLinks).toBe(false);
    });

    test("update.bookingFee with empty string resets to 0", async () => {
      await settings.update.bookingFee("500");
      expect(settings.bookingFee).toBe("500");
      await settings.update.bookingFee("");
      expect(settings.bookingFee).toBe("0");
    });

    test("updateUserPassword returns false when dataKey unwrap fails", async () => {
      const user = await getUserByUsername(TEST_ADMIN_USERNAME);
      expect(user).not.toBeNull();
      const storedHash = user!.password_hash;
      if (storedHash === "") {
        throw new Error("the test admin has no stored password hash");
      }
      const passwordHash = await verifyUserPassword(user!, TEST_ADMIN_PASSWORD);

      // The verify hands back the stored hash, decrypted, for KEK derivation.
      expect(passwordHash).toBe(await decrypt(storedHash));

      const { settings: s } = await import("#db/settings.ts");
      const result = await s.updateUserPassword(user!.id, {
        newPassword: "newpassword",
        oldKekVersion: user!.kek_version,
        oldPassword: TEST_ADMIN_PASSWORD,
        oldPasswordHash: passwordHash!,
        // Hand-crafted corrupt stored wrap — test fixture cast.
        oldWrappedDataKey: "corrupted_wrapped_data_key" as WrappedKey,
      });
      expect(result).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // Superuser choice settings DB extension
  // ---------------------------------------------------------------------------

  describe("orphan-purge settings", () => {
    const loadOrphanKeys = () =>
      settings.loadKeys([
        CONFIG_KEYS.AUTO_PURGE_ORPHANS,
        CONFIG_KEYS.ORPHAN_PURGE_RETENTION,
      ]);

    test("autoPurgeOrphans defaults to on for a fresh database", async () => {
      settings.invalidateCache();
      await loadOrphanKeys();
      expect(settings.autoPurgeOrphans).toBe(true);
    });

    test("autoPurgeOrphans reads an explicit 'false'", async () => {
      await settings.setRaw(CONFIG_KEYS.AUTO_PURGE_ORPHANS, "false");
      settings.invalidateCache();
      await loadOrphanKeys();
      expect(settings.autoPurgeOrphans).toBe(false);
    });

    test("autoPurgeOrphans reads an explicit 'true'", async () => {
      await settings.setRaw(CONFIG_KEYS.AUTO_PURGE_ORPHANS, "true");
      settings.invalidateCache();
      await loadOrphanKeys();
      expect(settings.autoPurgeOrphans).toBe(true);
    });

    test("update.autoPurgeOrphans persists across a round-trip", async () => {
      await settings.update.autoPurgeOrphans(false);
      expect(settings.autoPurgeOrphans).toBe(false);
      settings.invalidateCache();
      await loadOrphanKeys();
      expect(settings.autoPurgeOrphans).toBe(false);
    });

    test("orphanPurgeRetention defaults to 6 months (182 days)", async () => {
      settings.invalidateCache();
      await loadOrphanKeys();
      expect(settings.orphanPurgeRetention).toBe(DEFAULT_ORPHAN_RETENTION);
    });

    test("orphanPurgeRetention keeps a valid stored age", async () => {
      await settings.setRaw(CONFIG_KEYS.ORPHAN_PURGE_RETENTION, "365");
      settings.invalidateCache();
      await loadOrphanKeys();
      expect(settings.orphanPurgeRetention).toBe("365");
    });

    test("orphanPurgeRetention coerces an invalid stored age to the default", async () => {
      await settings.setRaw(CONFIG_KEYS.ORPHAN_PURGE_RETENTION, "not-an-age");
      settings.invalidateCache();
      await loadOrphanKeys();
      expect(settings.orphanPurgeRetention).toBe(DEFAULT_ORPHAN_RETENTION);
    });

    test("update.orphanPurgeRetention persists across a round-trip", async () => {
      await settings.update.orphanPurgeRetention("730");
      expect(settings.orphanPurgeRetention).toBe("730");
      settings.invalidateCache();
      await loadOrphanKeys();
      expect(settings.orphanPurgeRetention).toBe("730");
    });
  });
});
