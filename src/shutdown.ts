/**
 * Stops the server when the container runtime sends SIGTERM or SIGINT.
 * The image has no init process, so process 1 ignores both signals unless the
 * app listens for them.
 */

type Signals = {
  addSignalListener: (signal: Deno.Signal, handler: () => void) => void;
  exit: (code: number) => never;
};

const STOP_SIGNALS: readonly Deno.Signal[] = ["SIGTERM", "SIGINT"];

const realSignals: Signals = {
  addSignalListener: (signal, handler) =>
    Deno.addSignalListener(signal, handler),
  exit: (code) => Deno.exit(code),
};

/** Finishes open requests, then exits with code 0, on the first stop signal. */
export const stopOnSignals = (
  server: Pick<Deno.HttpServer, "shutdown">,
  signals: Signals = realSignals,
): void => {
  const stop = async (): Promise<void> => {
    await server.shutdown();
    signals.exit(0);
  };
  for (const signal of STOP_SIGNALS) {
    signals.addSignalListener(signal, stop);
  }
};
