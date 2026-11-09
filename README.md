# tickets-homelab

A fork of [Chobble Tickets](https://github.com/chobbledotcom/tickets), a
reservation and ticketing system by [Chobble CIC](https://www.chobble.com). This
fork has been changed a lot and will keep changing. It focuses on:

- **Security**, in the app and in how it is built and shipped.
- **A smaller attack surface.** Code, tooling, and deployment paths that this
  fork does not need are removed.
- **Hardened container images.** Upstream's Nix-based container strategy is
  replaced by a conventional Docker/Podman build on
  [Project Hummingbird](https://hummingbird-project.io/) (Red Hat Hardened
  Images) base images.

Upstream targets Bunny Edge Scripting and several hosting platforms. This fork
supports container deployment only. It focuses on rootless
[Podman Quadlets](https://docs.podman.io/en/latest/markdown/podman-quadlet.1.html)
(systemd units that run containers). Nix and devenv, the ratchet and quality
scripts, TLA/Apalache models, Cucumber specs, mutation testing, real-browser
tests, the Bunny edge build and deploy tooling, deploy workflows, `cli/`, and
`docs/` stay in the upstream project.

## What it does

Chobble Tickets is a booking system for free and paid listings. It runs on Deno
with libsql (a local SQLite file or remote Turso), and it encrypts all attendee
PII at rest. Highlights:

- Fixed-capacity and daily (per-date) listings, multi-listing checkout, and
  embeddable booking forms
- Payments through Stripe, Square, or SumUp, with deposits, pay-what-you-want
  pricing, refunds, and tax handling
- QR-code tickets, a built-in check-in scanner, and Apple/Google Wallet passes
- An admin back office with graded roles, CSV export, an activity log, bulk
  email, and privacy and GDPR tools
- Email notifications, ICS/RSS/CalDAV feeds, webhooks, and public and admin
  JSON APIs

See the [upstream README](https://github.com/chobbledotcom/tickets#readme) for
the full feature list.

## Run with Podman

```bash
DB_ENCRYPTION_KEY="$(openssl rand -base64 32)"
podman build -t tickets .
podman volume create tickets-data
podman run --rm -p 3000:3000 -v tickets-data:/data \
  -e DB_ENCRYPTION_KEY=$DB_ENCRYPTION_KEY tickets
curl http://localhost:3000/health   # Up :)
```

Keep the same `DB_ENCRYPTION_KEY` between runs. If it changes, the data in the
volume becomes unreadable. On first launch, visit `/setup/` to set the admin
credentials and currency. Payment providers are set up at `/admin/settings`.

A prebuilt multi-architecture image (x86-64 and arm64) is published on each push
to `main`:

```bash
podman pull ghcr.io/abyrne55/tickets-homelab:main
```

## Deploy with a rootless Podman Quadlet

The deployment method this fork focuses on is a rootless
[Quadlet](https://docs.podman.io/en/latest/markdown/podman-quadlet.1.html). Each
step below runs as your normal user, not as root.

1. Store the encryption key as a Podman secret:

   ```bash
   openssl rand -base64 32 | podman secret create tickets-db-key -
   ```

   Back this secret up. Without it, the data in the volume can't be read.

2. Create the units directory:

   ```bash
   mkdir -p ~/.config/containers/systemd
   ```

3. Define the data volume as a
   [volume unit](https://docs.podman.io/en/latest/markdown/podman-volume.unit.5.html).
   Save this as `~/.config/containers/systemd/tickets-data.volume`:

   ```ini
   [Volume]
   VolumeName=tickets-data
   ```

4. Save the container unit as
   `~/.config/containers/systemd/tickets.container`:

   ```ini
   [Unit]
   Description=Tickets

   [Container]
   Image=ghcr.io/abyrne55/tickets-homelab:main
   PublishPort=3000:3000
   Volume=tickets-data.volume:/data
   Secret=tickets-db-key,type=env,target=DB_ENCRYPTION_KEY

   [Install]
   WantedBy=default.target
   ```

   Because `Volume=` names the `.volume` unit, systemd creates the volume before
   it starts the container.

5. Load and start the units:

   ```bash
   systemctl --user daemon-reload
   systemctl --user start tickets.service
   ```

6. Optional: so that the service starts at boot without a login session, run
   `loginctl enable-linger $USER`.

## The container image

The `Containerfile` has two stages. The build stage compiles the server into a
single binary with `deno compile`. The runtime stage is
`quay.io/hummingbird/curl:8`, which has no shell and no init process. The
server:

- Runs as the unprivileged user 65532.
- Can write only under `/data`. A bind mount must belong to user 65532
  (`chown 65532 <dir>`, or `podman unshare chown 65532 <dir>`). If `/data` is
  not writable, the first database write fails and the error is in the log.
- Uses the SQLite file `file:/data/tickets.db` by default. Set `DB_URL` and
  `DB_TOKEN` to use a remote Turso database instead.
- Exits at start if `DB_ENCRYPTION_KEY` is missing.

The image works with a read-only root filesystem. The server unpacks its
database library into `/tmp` and loads it from there, so mount a `/tmp` that
allows programs to run: `--tmpfs /tmp:rw,exec,mode=1777`. A `noexec` mount,
which is Docker's default for `--tmpfs`, stops the server at start.

`scripts/container-check.sh` boots the image and checks three things. The image
must serve requests, stop on SIGTERM with exit code 0, and restart on the same
volume with a read-only root:

```bash
CONTAINER_IMAGE=localhost/tickets scripts/container-check.sh
```

## Develop and test

`./dev` runs one command in the dev image with the repo mounted. Build the image
once:

```bash
podman build -t tickets-dev -f Containerfile.dev .
```

Then:

```bash
./dev deno task typecheck                          # needs ~4 GiB for the VM
./dev biome check --error-on-warnings src test scripts   # Biome
./dev scripts/test.sh test/shared/dates.test.ts    # one file
./dev scripts/test.sh                              # the whole suite
./dev                                              # a shell in the image
```

`scripts/test.sh` builds the static assets, starts stripe-mock, and runs
`deno test`. The full suite takes about 10 minutes with 6 CPUs and 4 GiB in the
Podman machine.

### CI

The workflows are in `.github/workflows`. A pull request against `main` runs
typecheck, Biome, and the test suite in the dev image. It also builds the
runtime image and runs `scripts/container-check.sh` on it. A push to `main`
builds both architectures on native runners and publishes
`ghcr.io/abyrne55/tickets-homelab:main`.

## Configuration

| Variable            | Required | Description                                 |
| ------------------- | -------- | ------------------------------------------- |
| `DB_ENCRYPTION_KEY` | Yes      | 32-byte base64-encoded AES-256 key          |
| `DB_URL`            | No       | libsql URL (default `file:/data/tickets.db`) |
| `DB_TOKEN`          | No\*     | Auth token (\*remote databases only)        |

Selected optional variables:

| Variable              | Description                                                                                                                                                       |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `LOCAL_STORAGE_PATH`  | Directory for uploaded images and files. Must be under `/data`.                                                                                                   |
| `DEBUG_KEY`           | `GET /health` returns a plain `Up :)`. A request with a matching `X-Debug-Key` header gets build and time details as JSON. When unset, the JSON response is off. |
| `ADMIN_EMAIL_ADDRESS` | Turns on a superuser recovery account and the owner-only Support page. Email delivery must be set up first.                                                     |

The upstream
[CONFIG_KEYS reference](https://chobbledotcom.github.io/tickets/doc.ts/~/CONFIG_KEYS.html)
lists every option, including email providers, wallet passes, and uploads.

## Security in the app

These protections come from upstream:

- **Encryption at rest.** Attendee PII and payment references use hybrid
  RSA-OAEP and AES-256-GCM. A database dump plus the environment key is still
  not enough to decrypt PII without an admin password or API key. API
  credentials and sensitive settings use AES-256-GCM. Passwords are hashed with
  PBKDF2 (600k iterations, SHA-256).
- **Request protection.** CSRF uses double-submit cookies with an HMAC-signed
  cookieless fallback. POST bodies are checked for their Content-Type.
- **Abuse limits.** Repeated failed logins, unknown ticket tokens, and failed
  API keys trigger lockouts. Client IPs are HMAC-hashed before storage.
- **SSRF guard.** Any URL the server fetches for an operator must be public
  HTTPS. Localhost, `.internal`, and raw IP addresses are rejected.
- **Sessions.** Tokens are hashed before storage, sessions expire after 24
  hours, and cookies are HttpOnly. Password checks run in constant time.

These measures make common attacks harder. They do not replace good operational
practice: key management, access control, and monitoring.

## License

[AGPL-3.0-only](LICENSE), as upstream. Chobble Tickets is developed by
[Chobble CIC](https://www.chobble.com), a community interest company.
