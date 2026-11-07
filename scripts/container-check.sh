#!/usr/bin/env bash
# Boots the image and checks that it serves, keeps its data, and stops cleanly.
# CONTAINER_IMAGE names the image. The default is the published latest tag.
# CONTAINER_ENGINE names the engine that holds the image. The default is podman,
# or docker when podman is missing.
set -euo pipefail

engine="${CONTAINER_ENGINE:-$(command -v podman || command -v docker)}"
image="${CONTAINER_IMAGE:-ghcr.io/abyrne55/tickets-homelab:latest}"
container="tickets-verify"
volume="tickets-verify-data"
key="MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY="
base="http://127.0.0.1:13000"
cleanup() {
  "$engine" rm -f "$container" >/dev/null 2>&1 || true
  "$engine" volume rm -f "$volume" >/dev/null 2>&1 || true
}
cleanup
trap 'cleanup' EXIT

start() {
  "$engine" rm -f "$container" >/dev/null 2>&1 || true
  "$engine" run -d --name "$container" -p 127.0.0.1:13000:3000 \
    -e DB_ENCRYPTION_KEY="$key" -v "$volume:/data" "$@" "$image" >/dev/null
}

wait_for_health() {
  for _ in $(seq 1 20); do
    if [ "$(curl -fsS -m 5 "$base/health" 2>/dev/null)" = "Up :)" ]; then
      return 0
    fi
    sleep 3
  done
  echo "The image did not serve /health within a minute. Logs:" >&2
  "$engine" logs "$container" || true
  exit 1
}

status() { curl -sS -m 10 -o /dev/null -w "%{http_code}" "$base$1"; }

stop_cleanly() {
  "$engine" stop --time 5 "$container" >/dev/null
  exit_code="$("$engine" inspect --format '{{.State.ExitCode}}' "$container")"
  if [ "$exit_code" != "0" ]; then
    echo "Container did not stop on SIGTERM (exit $exit_code). Logs:" >&2
    "$engine" logs "$container" || true
    exit 1
  fi
  echo "Container stopped on SIGTERM (exit $exit_code)."
}

start
wait_for_health
echo "Server answered /health."
home="$(status /)"
setup="$(status /setup)"
if [ "$home" != "503" ] || [ "$setup" != "200" ]; then
  echo "Expected home 503 (got $home) and setup 200 (got $setup). Logs:" >&2
  "$engine" logs "$container" || true
  exit 1
fi
echo "Server answered home 503 and setup 200."
for asset in style.css admin.js; do
  if [ "$(status "/$asset")" != "200" ]; then
    echo "Expected $asset to answer 200." >&2
    exit 1
  fi
done
echo "Server answered its built-in assets."
stop_cleanly

# A new container on the same volume must start, with a read-only root. The
# server unpacks its database library into /tmp and loads it from there, so
# the /tmp mount must allow programs to run. Docker mounts tmpfs as noexec.
start --read-only --tmpfs /tmp:rw,exec,mode=1777
wait_for_health
echo "Server restarted on the same volume with a read-only root."
stop_cleanly
