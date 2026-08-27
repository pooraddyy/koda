# Testing Koda

This guide describes terminal-only validation for the Koda CLI and its optional local HTTP server. It is written for contributors testing the source checkout, not an unrelated `koda` binary already installed on the machine.

## Fast validation matrix

| Goal | Command |
|---|---|
| Restore the locked dependency graph | `bun install --frozen-lockfile` |
| Inspect source CLI help | `bun run --cwd packages/opencode --conditions=node src/index.ts --help` |
| Run terminal UI tests | `bun test --cwd packages/tui` |
| Type-check the terminal UI | `bun run --cwd packages/tui typecheck` |
| Run project-memory tests | `bun test --cwd packages/koda-memory` |
| Run Koda-focused CLI tests | `bun test --cwd packages/opencode test/koda` |

The root `bun test` command intentionally exits with an explanatory message. Use narrow, package-local checks so failures are attributable and resource use remains predictable.

## Test the source CLI

From the repository root, `bun run dev` executes the source CLI under Node conditions. It does not invoke a globally installed binary.

```bash
bun run dev -- --help
bun run dev -- run "summarize the repository structure without editing files"
```

Use `--help` first when you are validating an unfamiliar command. It confirms that argument parsing and command registration are available without requiring provider credentials or a model request.

## Test local server mode

Use local server mode only when you need to exercise HTTP endpoints, session behavior, or event streaming. Bind to loopback during development and set a unique password before starting the process.

```bash
PASS="$(openssl rand -hex 24)"
LOG="/tmp/koda-serve-$$.log"
PID_FILE="/tmp/koda-serve-$$.pid"

koda_SERVER_PASSWORD="$PASS" \
  bun run dev -- serve --hostname 127.0.0.1 --port 0 >"$LOG" 2>&1 &
echo $! >"$PID_FILE"

until grep -q "server listening" "$LOG"; do sleep 0.1; done
PORT="$(grep -oE 'http://[^:]+:[0-9]+' "$LOG" | tail -1 | sed -E 's/.*:([0-9]+)/\1/')"
BASE="http://127.0.0.1:$PORT"
AUTH="Authorization: Basic $(printf 'koda:%s' "$PASS" | base64 | tr -d '\n')"
```

Confirm the process is healthy before exercising authenticated routes.

```bash
curl --fail --silent --show-error "$BASE/global/health"
curl --fail --silent --show-error -H "$AUTH" \
  "$BASE/session?directory=$(printf %s "$PWD" | jq -sRr @uri)"
```

Always terminate the test process and remove its temporary files.

```bash
kill "$(cat "$PID_FILE")" 2>/dev/null || true
rm -f "$PID_FILE" "$LOG"
```

> Do not expose an unauthenticated development server through a public tunnel or a shared network. See [`SECURITY.md`](SECURITY.md) before using server mode beyond local testing.

## Useful runtime controls

| Setting | Purpose |
|---|---|
| `koda_SERVER_PASSWORD` | Requires HTTP Basic authentication for local server mode. |
| `koda_DB=":memory:"` | Uses in-memory SQLite for hermetic test runs. |
| `koda_DISABLE_DEFAULT_PLUGINS=true` | Prevents bundled plugins from loading. |
| `koda_WORKSPACE_ID=<id>` | Uses a single-workspace runtime context. |
| `koda_TELEMETRY_LEVEL=off` | Disables telemetry during a test run. |
| `koda_CONFIG_CONTENT='{…}'` | Supplies inline JSON configuration without writing a config file. |

## Test discipline

Prefer a focused regression test that reproduces the reported behavior. Keep credentials, provider keys, session transcripts, and temporary HTTP logs outside the repository. When a test modifies fixtures or persistent state, use a unique temporary path and clean it up even when the assertion fails.

Run the narrowest relevant checks first, then expand only when the changed surface requires it. A passing command should be recorded with its exact scope; a resource-limited or environment-dependent command should be reported as such rather than treated as a product pass.
