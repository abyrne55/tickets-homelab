import { expect } from "@std/expect";
import { describe, it as test } from "@std/testing/bdd";
import {
  boolUpdate,
  ENCRYPTED_KEY_SET,
  PLAINTEXT_KEY_SET,
  rawUpdate,
  stringAccessors,
} from "#db/settings/accessors.ts";

import { CONFIG_KEYS, settings } from "#db/settings.ts";
import { describeWithEnv } from "#test-utils/db.ts";

describe("db > settings accessors getters", () => {
  test("reads the generated getter from the snapshot at read time", () => {
    settings.setForTest({ sms_gateway_base_url: "https://gw.example" });
    try {
      expect(stringAccessors.getters.smsGatewayBaseUrl).toBe(
        "https://gw.example",
      );
      settings.setForTest({ sms_gateway_base_url: "https://other.example" });

      // The getter reads at read time. A frozen copy would keep the first
      // value here.
      expect(stringAccessors.getters.smsGatewayBaseUrl).toBe(
        "https://other.example",
      );
    } finally {
      settings.clearTestOverrides();
    }
  });

  test("keeps every generated getter on its own snapshot field", () => {
    settings.setForTest({ business_email: "owner@example.com" });
    try {
      expect(stringAccessors.getters.businessEmail).toBe("owner@example.com");
    } finally {
      settings.clearTestOverrides();
    }
  });

  test("splits the registry keys into encrypted and plaintext sets", () => {
    expect(ENCRYPTED_KEY_SET.has(CONFIG_KEYS.BUSINESS_EMAIL)).toBe(true);
    expect(PLAINTEXT_KEY_SET.has(CONFIG_KEYS.SMS_GATEWAY_BASE_URL)).toBe(true);
    expect(ENCRYPTED_KEY_SET.has(CONFIG_KEYS.SMS_GATEWAY_BASE_URL)).toBe(false);
  });
});

describe("db > settings accessors readOnly", () => {
  test("gives a readOnly accessor no updater", () => {
    expect(Object.hasOwn(stringAccessors.getters, "publicKey")).toBe(true);
    expect(Object.hasOwn(stringAccessors.updaters, "publicKey")).toBe(false);
  });
});

describeWithEnv(
  "db > settings accessors updaters",
  { db: true, encryptionKey: true },
  () => {
    test("an encrypted updater stores ciphertext and mirrors the plaintext", async () => {
      await stringAccessors.updaters.businessEmail("owner@example.com");

      const storedAtRest = settings.getCachedRaw(CONFIG_KEYS.BUSINESS_EMAIL);
      expect(storedAtRest).not.toBeNull();
      expect(storedAtRest).not.toBe("owner@example.com");
      expect(settings.businessEmail).toBe("owner@example.com");
    });

    test("a plaintext updater stores the value verbatim", async () => {
      await stringAccessors.updaters.smsGatewayBaseUrl("https://gw.example");

      expect(settings.getCachedRaw(CONFIG_KEYS.SMS_GATEWAY_BASE_URL)).toBe(
        "https://gw.example",
      );
      expect(settings.smsGatewayBaseUrl).toBe("https://gw.example");
    });

    test("a raw update writes the given string and mirrors it", async () => {
      await rawUpdate(
        CONFIG_KEYS.SMS_GATEWAY_BASE_URL,
        "sms_gateway_base_url",
      )("https://raw.example");

      expect(settings.getCachedRaw(CONFIG_KEYS.SMS_GATEWAY_BASE_URL)).toBe(
        "https://raw.example",
      );
      expect(settings.smsGatewayBaseUrl).toBe("https://raw.example");
    });

    test("a boolean update stores the strings the row holds", async () => {
      const setShowPublicApi = boolUpdate(
        CONFIG_KEYS.SHOW_PUBLIC_API,
        "show_public_api",
      );

      await setShowPublicApi(true);
      expect(settings.getCachedRaw(CONFIG_KEYS.SHOW_PUBLIC_API)).toBe("true");
      expect(settings.showPublicApi).toBe(true);

      await setShowPublicApi(false);
      expect(settings.getCachedRaw(CONFIG_KEYS.SHOW_PUBLIC_API)).toBe("false");
      expect(settings.showPublicApi).toBe(false);
    });
  },
);
