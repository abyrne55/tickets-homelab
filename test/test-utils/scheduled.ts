import { expect } from "@std/expect";
import { toBase64Url } from "#crypto/utils.ts";

export const TEST_SCHEDULED_KEY = toBase64Url(new Uint8Array(32).fill(7));

export const SCHEDULED_OWNER_ENV = {
  SCHEDULED_TASK_KEY: TEST_SCHEDULED_KEY,
} as const;

export const scheduledAuthorization = (
  key = TEST_SCHEDULED_KEY,
): Record<string, string> => ({ authorization: `Bearer ${key}` });

export const expectScheduledResponse = async (
  response: Response,
  status: number,
): Promise<void> => {
  expect(response.status).toBe(status);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(await response.text()).toBe("");
};
