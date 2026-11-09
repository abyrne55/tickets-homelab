#!/usr/bin/env bash
# Run tests with stripe-mock. Usage: scripts/test.sh [deno test args or paths]. Default: test/
set -euo pipefail
cd "$(dirname "$0")/.."
deno task build:static
port=$(deno eval 'const l=Deno.listen({port:0});console.log(l.addr.port);l.close()')
"${STRIPE_MOCK_BIN:-.bin/stripe-mock}" -http-port "$port" >/dev/null 2>&1 &
mock=$!
trap 'kill $mock 2>/dev/null || true' EXIT
for _ in $(seq 1 50); do curl -s -o /dev/null "http://localhost:$port/" && break; sleep 0.1; done
export STRIPE_MOCK_HOST=localhost STRIPE_MOCK_PORT="$port"
[ $# -gt 0 ] || set -- test/
deno test --no-check --allow-all --parallel --v8-flags=--expose-gc \
  --preload ./test/test-utils/preload.ts "$@"
