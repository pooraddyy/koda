# Koda CI Containers

These Linux container images make Koda’s terminal-oriented CI jobs reproducible and faster by pre-installing heavyweight build dependencies. They are for GitHub Actions runners that support `job.container`; they are not required to run Koda locally.

| Image | Purpose |
|---|---|
| `base` | Ubuntu 24.04 with the common utilities required by CI. |
| `bun-node` | The base image plus the repository’s Bun and Node.js runtime prerequisites. |
| `rust` | The Bun/Node image plus stable Rust for retained native dependencies. |
| `publish` | The Bun/Node image plus the publishing utilities needed by controlled release workflows. |

## Build and publish

Run these commands from the repository root. Replace the registry only when publishing to a reviewed registry namespace.

```bash
REGISTRY=ghcr.io/pooraddyy TAG=24.04 bun ./packages/containers/script/build.ts
REGISTRY=ghcr.io/pooraddyy TAG=24.04 bun ./packages/containers/script/build.ts --push
```

The regular build produces local images. The `--push` form uses Buildx to publish amd64 and arm64 variants, so it must run in a credentialed release environment with intentional registry permissions.

## GitHub Actions usage

```yaml
jobs:
  terminal-checks:
    runs-on: ubuntu-latest
    container:
      image: ghcr.io/pooraddyy/build/bun-node:24.04
    steps:
      - uses: actions/checkout@v6
      - run: bun install --frozen-lockfile --no-progress
      - run: bun test --cwd packages/tui
```

These images apply only to Linux jobs. Keep macOS and Windows behavior in their native runners, and provide Docker daemon access explicitly only to jobs that build or publish images.
