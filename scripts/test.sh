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
export DB_ENCRYPTION_KEY="${DB_ENCRYPTION_KEY:-MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=}"
flags=(--no-check --allow-all --v8-flags=--expose-gc --preload ./test/test-utils/preload.ts)
if [ $# -gt 0 ]; then
  deno test "${flags[@]}" --parallel "$@"
  exit
fi
# Files marked `test-groups: run-alone` (happy-dom timers that outlive a test)
# run serially in a second pass. In one parallel pass they hang under load.
alone=()
while IFS= read -r f; do alone+=("$f"); done < <(
  grep -rlE --include='*.test.ts' --include='*.test.tsx' 'test-groups: run-alone' test | sort)
ignore=$(IFS=,; echo "${alone[*]}")
deno test "${flags[@]}" --parallel --ignore="$ignore" test/
deno test "${flags[@]}" "${alone[@]}"
