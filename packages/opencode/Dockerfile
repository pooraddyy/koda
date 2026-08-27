FROM alpine AS base

# Disable the runtime transpiler cache by default inside Docker containers.
# On ephemeral containers, the cache is not useful
ARG BUN_RUNTIME_TRANSPILER_CACHE_PATH=0
ENV BUN_RUNTIME_TRANSPILER_CACHE_PATH=${BUN_RUNTIME_TRANSPILER_CACHE_PATH}
RUN apk add libgcc libstdc++ ripgrep

FROM base AS build-amd64
# koda_change start
COPY dist/@koda-code/cli-linux-x64-baseline-musl/bin/koda dist/@koda-code/cli-linux-x64-baseline-musl/bin/bwrap /usr/local/bin/
COPY dist/@koda-code/cli-linux-x64-baseline-musl/bin/licenses /usr/local/share/licenses/koda
# koda_change end

FROM base AS build-arm64
# koda_change start
COPY dist/@koda-code/cli-linux-arm64-musl/bin/koda dist/@koda-code/cli-linux-arm64-musl/bin/bwrap /usr/local/bin/
COPY dist/@koda-code/cli-linux-arm64-musl/bin/licenses /usr/local/share/licenses/koda
# koda_change end

ARG TARGETARCH
FROM build-${TARGETARCH}
RUN koda --version
ENTRYPOINT ["koda"]
