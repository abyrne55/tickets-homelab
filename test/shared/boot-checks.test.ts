import { expect } from "@std/expect";
import { it as test } from "@std/testing/bdd";
import { BOOT_CHECKS, validateBootChecks } from "#shared/boot-checks.ts";
import { describeWithEnv } from "#test-utils/db.ts";
import { clearTestEncryptionKey, withEnv } from "#test-utils/env.ts";

describeWithEnv("boot checks", { encryptionKey: true }, () => {
  test("lists the global checks run before serving requests", () => {
    expect(BOOT_CHECKS.map((check) => check.name)).toEqual([
      "DB_ENCRYPTION_KEY",
      "SCHEDULED_TASK_KEY",
    ]);
  });

  test("runs DB_ENCRYPTION_KEY validation during boot checks", () => {
    clearTestEncryptionKey();
    expect(() => validateBootChecks()).toThrow(
      "DB_ENCRYPTION_KEY environment variable is required",
    );
  });

  test("runs scheduled key validation during boot checks", () => {
    using _env = withEnv({ SCHEDULED_TASK_KEY: "invalid" });
    expect(() => validateBootChecks()).toThrow(
      "SCHEDULED_TASK_KEY must be canonical unpadded base64url for exactly 32 bytes",
    );
  });
});
