import { expect } from "@std/expect";
import { afterEach, describe, it as test } from "@std/testing/bdd";
import {
  getBotpoisonPublicKey,
  getBotpoisonSecretKey,
  getDebugKey,
  isBotpoisonEnabled,
  isSecureMode,
  resetEffectiveDomain,
  seedEffectiveDomainHost,
  setEffectiveDomainForTest,
} from "#shared/config.ts";
import { withEnv } from "#test-utils/env.ts";

type BoolGetter = () => boolean;
type StringGetter = () => string;
type MissingValueCheck = {
  readonly name: string;
  readonly check: (getValue: StringGetter, key: string) => void;
};

const expectEnvGetter =
  (missing: MissingValueCheck) =>
  (name: string, getValue: StringGetter, key: string, value: string) => {
    describe(name, () => {
      test("returns the configured value", () => {
        using _env = withEnv({ [key]: value });
        expect(getValue()).toBe(value);
      });

      test(missing.name, () => {
        using _env = withEnv({ [key]: undefined });
        missing.check(getValue, key);
      });
    });
  };

const expectOptionalEnvGetter = expectEnvGetter({
  check: (getValue) => {
    expect(getValue()).toBe("");
  },
  name: "returns an empty string when unset",
});

const expectEnabledByAllKeys = (
  name: string,
  isEnabled: BoolGetter,
  keys: string[],
) => {
  describe(name, () => {
    const allKeysSet = Object.fromEntries(
      keys.map((key) => [key, `${key.toLowerCase()}_value`]),
    );

    test("returns true when every required value is set", () => {
      using _env = withEnv(allKeysSet);
      expect(isEnabled()).toBe(true);
    });

    for (const missingKey of keys) {
      test(`returns false when ${missingKey} is missing`, () => {
        using _env = withEnv({ ...allKeysSet, [missingKey]: undefined });
        expect(isEnabled()).toBe(false);
      });
    }
  });
};

describe("isSecureMode", () => {
  afterEach(() => resetEffectiveDomain());

  const localHosts = [
    "localhost",
    "admin.localhost",
    "127.0.0.1",
    "127.255.255.255",
    "[::1]",
    "::1",
  ];

  for (const host of localHosts) {
    test(`returns false for ${host}`, () => {
      setEffectiveDomainForTest(host);
      expect(isSecureMode()).toBe(false);
    });
  }

  const secureHosts = [
    "example.com",
    "not-localhost.example",
    "128.0.0.1",
    "127.0.0",
    "127.0.one.1",
    "127.0.0.256",
  ];

  for (const host of secureHosts) {
    test(`returns true for ${host}`, () => {
      setEffectiveDomainForTest(host);
      expect(isSecureMode()).toBe(true);
    });
  }

  test("seeds a real host through a URL and keeps secure mode on", () => {
    seedEffectiveDomainHost(new URL("http://tickets.example.com:3000/"));
    expect(isSecureMode()).toBe(true);
    seedEffectiveDomainHost(new URL("http://[::1]:3000/"));
    expect(isSecureMode()).toBe(false);
  });

  test("stays on for forged loopback shapes a URL cannot parse", () => {
    for (const host of ["127.0.0.1.5", "127.0.1e2.1"]) {
      setEffectiveDomainForTest(host);
      expect(isSecureMode(), host).toBe(true);
    }
  });
});

expectOptionalEnvGetter("getDebugKey", getDebugKey, "DEBUG_KEY", "debug_key");

expectOptionalEnvGetter(
  "getBotpoisonPublicKey",
  getBotpoisonPublicKey,
  "BOTPOISON_PUBLIC_KEY",
  "botpoison_public",
);
expectOptionalEnvGetter(
  "getBotpoisonSecretKey",
  getBotpoisonSecretKey,
  "BOTPOISON_SECRET_KEY",
  "botpoison_secret",
);
expectEnabledByAllKeys("isBotpoisonEnabled", isBotpoisonEnabled, [
  "BOTPOISON_PUBLIC_KEY",
  "BOTPOISON_SECRET_KEY",
]);
