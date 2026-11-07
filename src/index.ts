/**
 * Entry point for local development (`deno task start`).
 *
 * Boot checks run eagerly so a misconfigured environment fails at startup.
 * Everything else — Sentry, the N+1 guard mode, request handling — comes from
 * the shared production handler, exactly as the edge and Deploy entries use
 * it. Deno.serve prints its own "Listening on" line, so there is no bespoke
 * startup log here. SIGTERM and SIGINT stop the server, because the container
 * image has no init process.
 */

import { validateBootChecks } from "#shared/boot-checks.ts";
import { denoServeHandler, devServerPort } from "./serve-app.ts";
import { stopOnSignals } from "./shutdown.ts";

validateBootChecks();
stopOnSignals(Deno.serve({ port: devServerPort() }, denoServeHandler));
