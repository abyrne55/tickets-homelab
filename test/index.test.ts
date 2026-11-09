import { expect } from "@std/expect";
import { it as test } from "@std/testing/bdd";
import { stub } from "@std/testing/mock";
import { denoServeHandler } from "#src/serve-app.ts";
import { importEntry } from "#test-utils/entry.ts";
import { withEnv } from "#test-utils/env.ts";

test("the dev entry serves through the Deno adapter on PORT", async () => {
  using _env = withEnv({ PORT: "8123" });
  using _signals = stub(Deno, "addSignalListener", () => undefined);
  expect(await importEntry("#src/index.ts", "serves")).toEqual([
    [{ port: 8123 }, denoServeHandler],
  ]);
});

test("the dev entry stops on SIGTERM and SIGINT", async () => {
  using signals = stub(Deno, "addSignalListener", () => undefined);
  await importEntry("#src/index.ts", "stops");
  expect(signals.calls.map((call) => call.args[0])).toEqual([
    "SIGTERM",
    "SIGINT",
  ]);
});

test("the dev entry refuses to start when a boot check fails", async () => {
  using _env = withEnv({ MAIN_INSTANCE_KEY: "too-short" });
  await expect(importEntry("#src/index.ts", "refuses")).rejects.toThrow(
    "MAIN_INSTANCE_KEY must be at least 32 bytes",
  );
});
