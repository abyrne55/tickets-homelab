# AGENTS.md

This file provides guidance to AI coding agents working with code in this repository.

## What this is

A slimmed, security-focused fork of [Chobble Tickets](https://github.com/chobbledotcom/tickets): a Deno + libsql (SQLite/Turso) booking and ticketing server. This fork ships only as a hardened container image (Hummingbird base, `deno compile` single binary) for rootless Podman Quadlets. Upstream's Nix/devenv, Bunny edge build and deploy tooling, `cli/`, `docs/`, Cucumber, TLA models, and mutation testing were removed on purpose. Do not reintroduce them. Comments and some code (`src/edge.ts`, `src/deploy.ts`, `bunny-*.ts`) still refer to upstream platforms.

## Commands

All tooling (Deno, Biome, stripe-mock, pinned by checksum) lives in the dev image. `./dev <cmd>` runs one command in it with the repo mounted at `/work`. Build the image once:

```bash
podman build -t tickets-dev -f Containerfile.dev .
```

```bash
./dev deno task typecheck                                # deno check src test scripts (needs ~4 GiB in the Podman VM)
./dev biome check --error-on-warnings src test scripts   # lint as CI runs it
./dev deno task lint                                     # biome with --write --unsafe (autofix)
./dev scripts/test.sh test/shared/dates.test.ts          # one test file
./dev scripts/test.sh --filter "name" test/some.test.ts  # args pass through to `deno test`
./dev scripts/test.sh                                    # whole suite, about 10 minutes
./dev                                                    # shell in the image
```

- Run tests through `scripts/test.sh`, not bare `deno test`. It builds static assets, starts stripe-mock on a free port, exports a test `DB_ENCRYPTION_KEY`, and preloads `test/test-utils/preload.ts`.
- Tests run with `--no-check`, so a passing test run says nothing about types. Run typecheck separately.
- In CI, call `biome` directly rather than `deno task lint:ci`: with a fresh Deno cache the task resolves to a broken npm copy of Biome.
- `CONTAINER_ENGINE=docker` switches `./dev` and `scripts/container-check.sh` to Docker.

Runtime image:

```bash
podman build -t tickets .
CONTAINER_IMAGE=localhost/tickets scripts/container-check.sh   # serves, exits 0 on SIGTERM, restarts with read-only root
```

CI (`.github/workflows/pr.yml`) runs typecheck, Biome, the test suite, and the image build plus `container-check.sh`. A push to `main` publishes `ghcr.io/abyrne55/tickets-homelab:main` for amd64 and arm64. Actions are pinned by commit SHA; keep it that way.

`prek.toml` defines the pre-commit hooks (built-in checks only). `repomix.config.json` produces `repomix-output.xml`, which is gitignored and about 24 MB. Never read it into context.

## Architecture

### Request path

`src/index.ts` (the only entry the image uses) runs boot checks and hands `Deno.serve` to `denoServeHandler` in `src/serve-app.ts`, which boots once and turns unhandled errors into a generic 503. `src/shutdown.ts` handles SIGTERM/SIGINT because the image has no init process.

`handleRequest` in `src/features/app/request.ts` (import alias `#routes`) is the pipeline: content-type and CSRF checks, security headers, settings prefetch, the migration and setup gates, then dispatch. `src/features/app/routes.ts` dispatches on the first path segment using the prefix table in `prefixes.ts` (split across `prefixes-a-l.ts` and `prefixes-m-z.ts`), and applies the read-only guard. Feature routers are lazy-loaded so the cold import graph stays small.

`src/features/router.ts` is the declarative router. Routes are keyed `"METHOD /path/:param"`, and param types are inferred from the name: `id` and `*Id` are parsed as numbers, everything else is a string.

### Layout

- `src/features/` – HTTP handlers by area: `admin/`, `public/`, `api/`, `tickets/`, `wallet/`, plus cross-cutting files (auth, csrf, middleware, response helpers).
- `src/shared/` – domain logic with no HTTP: `db/`, `crypto/`, `payment/`, `booking/`, `accounting/`, config, env, logger.
- `src/ui/templates/` – server-rendered pages in TSX using the project's own JSX runtime (`src/shared/jsx/`, set by `jsxImportSource: "#jsx"`). This is not React.
- `src/ui/client/` – browser code. `scripts/build-static-assets.ts` bundles it with esbuild and Sass into `src/ui/static/*.js` and `style.css`, which are gitignored build output and are embedded in the compiled binary. Don't edit files there by hand.
- `src/locales/en/*.json` – ICU message catalogs split into groups. A route declares the groups it needs (`src/locales/groups.ts`, `withMessageGroups`), and `t()` from `#i18n` reads them.
- `src/fp.ts` (`#fp`) – curried, pipe-friendly helpers (`pipe`, `map`, `filter`, `once`, `lazyRef`, ...). The code is written in this style; Biome bans `forEach`, accumulating spreads, and `console`.
- `test/` mirrors `src/`, with `test/integration/` for cross-module tests and `test/test-utils/` for a large library of factories, fixtures, and stubs. Look there before writing a new helper.

Use the `#` import aliases from `deno.json` (`#db/`, `#shared/`, `#routes/`, `#templates/`, `#test-utils/`, ...) rather than relative paths across directories.

### Database

`src/shared/db/migrations.ts` is the boot path. The schema is declarative, and migrations are dated files in `src/shared/db/migrations/` (`YYYY-MM-DD_name.ts`). To change the schema, follow the header comment in `migrations.ts`, including bumping `LATEST_UPDATE`.

An N+1 query guard (`#db/query-log.ts`) throws in dev and test and only reports in production, so a test can fail because a handler issues repeated queries. Settings reads must be declared per path (`settings-bundles.ts`, `settings-audit.ts`).

Attendee PII is encrypted at rest with hybrid RSA-OAEP and AES-256-GCM keyed from `DB_ENCRYPTION_KEY` plus an admin password or API key. Server code cannot decrypt PII without a session-derived key, and many function signatures reflect that.

### Tests

- `@std/testing/bdd` is remapped in `deno.json` to `test/test-utils/bdd.ts`, a wrapper that adds name filtering. Import `describe`/`it` from `@std/testing/bdd` as usual.
- A file containing the comment `test-groups: run-alone` is run serially in a second pass by `scripts/test.sh`. Use it for happy-dom tests whose timers outlive the test.
- The suite includes code-quality guards that scan the source: unused exports, duplicate type shapes, and similar. Exemptions are data in `test/integration/code-quality/allowlists.ts`. A new export with no production caller fails the suite unless it is listed there.
- Biome rejects focused and skipped tests, files over 1000 lines, and cognitive complexity above 12 in `src/` (reported as a warning, which CI treats as an error).
- `// effects: pure` on the first line marks a module as free of side effects. Keep the marker truthful when editing such a file.

## Container constraints

These shape what code can do at runtime (see `Containerfile`):

- The binary is compiled with `--allow-write=/data` only. Any new write path must be under `/data`.
- The runtime image has no shell and runs as UID 65532. Nothing can shell out.
- Files read at runtime must be listed with `--include` in the `deno compile` step. A new runtime asset directory or a native/WASM codec needs a matching flag.
- The root filesystem may be read-only. libsql unpacks its native library into `/tmp`, which must be mounted `exec`.
- Deno, Biome, and stripe-mock versions are pinned with SHA-256 checksums for both architectures in `Containerfile` and `Containerfile.dev`. A version bump must update both checksums, and the Deno version in both files.
