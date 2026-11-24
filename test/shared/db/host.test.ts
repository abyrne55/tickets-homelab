import { expect } from "@std/expect";
import { describe, it as test } from "@std/testing/bdd";
import { databaseHostFor } from "#db/host.ts";

describe("database host", () => {
  const cases: [string, string][] = [
    ["libsql://db.example.com", "remote"],
    ["https://db.example.com", "remote"],
    ["libsql://tickets-chobble.turso.io", "remote"],
    ["file:local.db", "local"],
    ["local.db", "local"],
    ["", "local"],
  ];

  for (const [url, expected] of cases) {
    test(`reads ${url || "(blank)"} as ${expected}`, () => {
      expect(databaseHostFor(url)).toBe(expected);
    });
  }
});
