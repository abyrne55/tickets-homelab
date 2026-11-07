import { expect } from "@std/expect";
import { it as test } from "@std/testing/bdd";
import { stub } from "@std/testing/mock";
import { stopOnSignals } from "#src/shutdown.ts";

const fakeSignals = () => {
  const handlers = new Map<string, () => void>();
  const exits: number[] = [];
  return {
    exits,
    handlers,
    signals: {
      addSignalListener: (signal: Deno.Signal, handler: () => void) => {
        handlers.set(signal, handler);
      },
      exit: (code: number): never => {
        exits.push(code);
        return undefined as never;
      },
    },
  };
};

test("listens for SIGTERM and SIGINT", () => {
  const { handlers, signals } = fakeSignals();
  stopOnSignals({ shutdown: () => Promise.resolve() }, signals);
  expect([...handlers.keys()]).toEqual(["SIGTERM", "SIGINT"]);
});

for (const signal of ["SIGTERM", "SIGINT"] as const) {
  test(`${signal} finishes the server, then exits with code 0`, async () => {
    const { exits, handlers, signals } = fakeSignals();
    const order: string[] = [];
    stopOnSignals(
      {
        shutdown: async () => {
          await Promise.resolve();
          order.push("shutdown");
        },
      },
      {
        ...signals,
        exit: (code) => {
          order.push("exit");
          return signals.exit(code);
        },
      },
    );
    await handlers.get(signal)?.();
    expect(order).toEqual(["shutdown", "exit"]);
    expect(exits).toEqual([0]);
  });
}

test("uses the Deno signal listener and exit by default", async () => {
  const handlers = new Map<string, () => void>();
  using _listener = stub(
    Deno,
    "addSignalListener",
    (signal: Deno.Signal, handler: () => void) => {
      handlers.set(signal, handler);
    },
  );
  const codes: number[] = [];
  using _exit = stub(Deno, "exit", (code?: number): never => {
    codes.push(code ?? -1);
    return undefined as never;
  });
  stopOnSignals({ shutdown: () => Promise.resolve() });
  expect([...handlers.keys()]).toEqual(["SIGTERM", "SIGINT"]);
  await handlers.get("SIGTERM")?.();
  expect(codes).toEqual([0]);
});
