/**
 * Fail-fast validation for environment/configuration that must be sane before
 * the app starts accepting requests. Keep checks here when they are global
 * boot invariants rather than per-request validation concerns.
 */

import { validateEncryptionKey } from "#crypto/encryption.ts";
import { validateScheduledTaskKey } from "#shared/scheduled-keys.ts";

export type BootCheck = {
  name: string;
  run: () => void;
};

export const BOOT_CHECKS: readonly BootCheck[] = [
  { name: "DB_ENCRYPTION_KEY", run: validateEncryptionKey },
  { name: "SCHEDULED_TASK_KEY", run: validateScheduledTaskKey },
];

export const validateBootChecks = (): void => {
  for (const check of BOOT_CHECKS) check.run();
};
