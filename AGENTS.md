## What this is

A slimmed, security-focused fork of [Chobble Tickets](https://github.com/chobbledotcom/tickets): a Deno + libsql (SQLite/Turso) booking and ticketing server. This fork ships only as a hardened container image (Hummingbird base, `deno compile` single binary) for rootless Podman Quadlets. Upstream's Nix/devenv, Bunny edge build and deploy tooling, `cli/`, `docs/`, Cucumber, TLA models, and mutation testing were removed on purpose. Do not reintroduce them. Comments and some code (`src/edge.ts`, `src/deploy.ts`, `bunny-*.ts`) still refer to upstream platforms.

## Getting oriented

Before exploring the source, run `repomix` and read `repomix-output.xml`. It is a repo map of about 7k tokens that costs far less than browsing directories one by one. Then, when you need to understand a whole area, pack just that area with `repomix -c repomix.code.config.json --include "<glob>"` and read `repomix-code.xml` instead of opening its files one at a time. Sizes and details are under Commands. For a specific symbol or a file you already know, `grep` and a direct read are cheaper than a pack.

Repomix runs on the host, not through `./dev`. If `repomix` is not installed, use `npx repomix` in its place. Rerun it rather than trusting an old output file, since nothing regenerates the packs.

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
./dev env TICKETS_TEST_FILTER="name" scripts/test.sh test/some.test.ts   # one `it` or `describe` by name
./dev scripts/test.sh                                    # whole suite, about 10 minutes
./dev                                                    # shell in the image
```

- Run tests through `scripts/test.sh`, not bare `deno test`. It builds static assets, starts stripe-mock on a free port, exports a test `DB_ENCRYPTION_KEY`, and preloads `test/test-utils/preload.ts`.
- Deno's `--filter` cannot see a nested `it`, and reports success with zero tests run. Filter by name with the `TICKETS_TEST_FILTER` environment variable instead (a substring, or `/regex/`). Other arguments to `scripts/test.sh` pass through to `deno test`.
- Tests run with `--no-check`, so a passing test run says nothing about types. Run typecheck separately.
- In CI, call `biome` directly rather than `deno task lint:ci`: with a fresh Deno cache the task resolves to a broken npm copy of Biome.
- `CONTAINER_ENGINE=docker` switches `./dev` and `scripts/container-check.sh` to Docker.

Runtime image:

```bash
podman build -t tickets .
CONTAINER_IMAGE=localhost/tickets scripts/container-check.sh   # serves, exits 0 on SIGTERM, restarts with read-only root
```

CI (`.github/workflows/pr.yml`) runs typecheck, Biome, the test suite, and the image build plus `container-check.sh`. A push to `main` publishes `ghcr.io/abyrne55/tickets-homelab:main` for amd64 and arm64. Actions are pinned by commit SHA; keep it that way.

If your shell commands run in a sandbox, `git` and `gh` commands typically need to run outside it. `git commit` triggers the prek hooks, which write a log under `~/.cache/prek`, and `gh` fails TLS verification through a filtering proxy. `git push` can also fail to set upstream tracking. Read-only commands such as `git status` and `git log` work inside the sandbox. Don't work around a hook failure with `--no-verify`.

`prek.toml` defines the pre-commit hooks (built-in checks only). Running `repomix` produces `repomix-output.xml` (gitignored): a repo map, meaning the directory tree and no file contents, at about 7k tokens. It is small enough to read at session start. `.repomixignore` leaves out tests, locales, templates, styles, migrations, and lockfiles, so read those directly.

For code, pack only the area you are working on with the second config, which writes `repomix-code.xml` (gitignored) with comments stripped and bodies compressed: `repomix -c repomix.code.config.json --include "<glob>"`. Any glob or comma-separated list of globs works, so pick the narrowest directory that covers the task. Approximate sizes:

| `--include` glob | Tokens |
| --- | --- |
| `src/features/admin/**` | 100k |
| `src/features/public/**` | 18k |
| `src/features/api/**` | 17k |
| `src/shared/db/**` | 92k |
| `src/shared/payment/**` | 13k |
| `src/shared/booking/**` | 9k |
| `src/ui/client/**` | 9k |
| `scripts/**` | 8k |

Without `--include` it packs everything, about 456k tokens, which is too large to load whole. For sizes of other directories, run it with `--token-count-tree 5000`. Nothing regenerates either file automatically; rerun the command if it looks stale.

## Things the code won't tell you quickly

- `src/index.ts` is the only entry point the image uses. `handleRequest` in `src/features/app/request.ts` (alias `#routes`) is the request pipeline, and it dispatches on the first path segment through the prefix table in `src/features/app/prefixes.ts`.
- Route params are typed by name (`src/features/router.ts`): `id` and `*Id` are parsed as numbers, everything else is a string.
- Templates in `src/ui/templates/` are TSX on the project's own JSX runtime (`src/shared/jsx/`). This is not React.
- `src/ui/static/*.js` and `style.css` are gitignored build output from `scripts/build-static-assets.ts`, embedded in the compiled binary. Edit `src/ui/client/` instead.
- i18n copy lives in `src/locales/en/*.json`, split into groups. A route must declare the groups it needs (`src/locales/groups.ts`, `withMessageGroups`) before `t()` can read them.
- Use the `#` import aliases from `deno.json` (`#db/`, `#shared/`, `#routes/`, `#fp`, `#test-utils/`, ...) rather than relative paths across directories.
- The code is written in the curried, pipe-friendly style of `src/fp.ts`. Biome bans `forEach`, accumulating spreads, and `console`, rejects focused and skipped tests and files over 1000 lines, and warns on cognitive complexity above 12 in `src/`. CI treats warnings as errors.
- `test/test-utils/` is a large library of factories, fixtures, and stubs. Look there before writing a new helper.
- To change the schema, follow the header comment in `src/shared/db/migrations.ts`, including bumping `LATEST_UPDATE`.
- An N+1 query guard (`#db/query-log.ts`) throws in dev and test, so a test can fail because a handler repeats a query.
- Settings load on demand per path prefix (`src/features/settings-bundles.ts`). In dev and test, a route that reads a setting its prefix bundle does not declare fails an assertion at the end of the request.
- Attendee PII is encrypted at rest and cannot be decrypted with `DB_ENCRYPTION_KEY` alone. It also needs a key derived from an admin password or API key, and many function signatures reflect that.
- `@std/testing/bdd` is remapped in `deno.json` to `test/test-utils/bdd.ts`. Import `describe`/`it` from `@std/testing/bdd` as usual.
- A test file containing the comment `test-groups: run-alone` runs serially in a second pass. Use it for happy-dom tests whose timers outlive the test.
- `// effects: pure` on the first line marks a module as free of side effects. Keep the marker truthful when editing such a file.

## Container constraints

These shape what code can do at runtime (see `Containerfile`):

- The binary is compiled with `--allow-write=/data` only. Any new write path must be under `/data`.
- The runtime image has no shell and runs as UID 65532. Nothing can shell out.
- Files read at runtime must be listed with `--include` in the `deno compile` step. A new runtime asset directory or a native/WASM codec needs a matching flag.
- The root filesystem may be read-only. libsql unpacks its native library into `/tmp`, which must be mounted `exec`.
- Deno, Biome, and stripe-mock versions are pinned with SHA-256 checksums for both architectures in `Containerfile` and `Containerfile.dev`. A version bump must update both checksums, and the Deno version in both files.
