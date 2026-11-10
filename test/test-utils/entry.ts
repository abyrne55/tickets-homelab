import { stub } from "@std/testing/mock";
import { denoServeHandler } from "#src/serve-app.ts";

/** Import an entry file with `Deno.serve` stubbed, and answer the arguments of
 * each serve call. A query string gives each call a fresh module instance. */
export const importEntry = async (
  path: string,
  instance: string,
): Promise<unknown[][]> => {
  const serve = stub(
    Deno,
    "serve",
    () => ({}) as Deno.HttpServer<Deno.NetAddr>,
  );
  try {
    await import(`${path}?${instance}`);
    return serve.calls.map((call) => call.args);
  } finally {
    serve.restore();
  }
};

/** Serve a request through the Deno entry, with the client address as the
 * TCP connection's remote hostname. */
export const serveFromDeno = (
  request: Request,
  ip = "192.0.2.1",
): Promise<Response> =>
  denoServeHandler(request, {
    completed: Promise.resolve(),
    remoteAddr: { hostname: ip, port: 51000, transport: "tcp" },
  });
