# Build with: podman build --format docker -t tickets .
FROM quay.io/hummingbird/curl:8-builder AS build
USER 0
ARG TARGETARCH
ARG DENO_VERSION=2.9.8
ARG DENO_SHA256_AMD64=e890975bc2549807bbcc0b584ffafda72cc7c93349dd99c80483dd784f6c4609
ARG DENO_SHA256_ARM64=d49596c20b9788cf8f5d8ddf644103d4bde56ed239753f0bdb92ba9361d51905
RUN dnf install -y unzip && dnf clean all
RUN set -eu; \
    case "${TARGETARCH}" in \
      amd64) arch=x86_64; sha="${DENO_SHA256_AMD64}" ;; \
      arm64) arch=aarch64; sha="${DENO_SHA256_ARM64}" ;; \
      *) echo "Unsupported architecture: ${TARGETARCH}" >&2; exit 1 ;; \
    esac; \
    curl -fsSL -o /tmp/deno.zip "https://github.com/denoland/deno/releases/download/v${DENO_VERSION}/deno-${arch}-unknown-linux-gnu.zip"; \
    echo "${sha}  /tmp/deno.zip" | sha256sum -c -; \
    unzip -o /tmp/deno.zip -d /usr/local/bin; \
    rm /tmp/deno.zip

WORKDIR /src
COPY deno.json deno.lock ./
# Deno runs no npm lifecycle scripts without a node_modules directory.
RUN deno install --frozen
COPY src ./src
COPY scripts ./scripts
RUN deno task build:static
RUN deno compile --no-check --frozen --node-modules-dir=auto \
      --allow-net --allow-env --allow-read --allow-write=/data --allow-sys --allow-ffi \
      --include src/ui/static --include src/locales/en \
      --include node_modules/@jsquash/jpeg/codec \
      --include node_modules/@jsquash/png/codec \
      --include node_modules/@jsquash/webp/codec \
      --output /out/tickets src/index.ts
RUN mkdir -p /rootfs/data

FROM quay.io/hummingbird/curl:8
COPY --from=build --chown=65532:0 /out/tickets /usr/local/bin/tickets
COPY --from=build --chown=65532:0 /rootfs/data /data
ENV DB_URL=file:/data/tickets.db \
    PORT=3000
WORKDIR /data
VOLUME /data
EXPOSE 3000
USER 65532
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["/usr/bin/curl", "-fsS", "-o", "/dev/null", "http://127.0.0.1:3000/health"]
ENTRYPOINT ["/usr/local/bin/tickets"]
CMD []
