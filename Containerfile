# Build with: podman build -t tickets .
FROM quay.io/hummingbird/curl:8-builder AS build
USER 0
ARG TARGETARCH
# renovate: datasource=github-releases depName=denoland/deno extractVersion=^v(?<version>.*)$
ARG DENO_VERSION=2.9.8
RUN dnf install -y unzip && dnf clean all
RUN set -eu; \
    case "${TARGETARCH}" in \
      amd64) arch=x86_64 ;; \
      arm64) arch=aarch64 ;; \
      *) echo "Unsupported architecture: ${TARGETARCH}" >&2; exit 1 ;; \
    esac; \
    cd /tmp; \
    base="https://github.com/denoland/deno/releases/download/v${DENO_VERSION}/deno-${arch}-unknown-linux-gnu.zip"; \
    curl -fLO --proto =https "${base}"; \
    curl -fL --proto =https "${base}.sha256sum" | sha256sum -c -; \
    unzip -o deno-${arch}-unknown-linux-gnu.zip -d /usr/local/bin; \
    rm deno-${arch}-unknown-linux-gnu.zip

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
ENTRYPOINT ["/usr/local/bin/tickets"]
CMD []
