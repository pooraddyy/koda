# Koda CLI

`@koda-code/cli` is the public command-line distribution of Koda. It opens the terminal UI, runs task-oriented commands, coordinates provider access, and hosts the local services used by Koda's session and agent runtime.

## Install and start

Install one global CLI package, then run `koda` from the project you want to work on.

```bash
npm install --global @koda-code/cli
# or: pnpm add --global @koda-code/cli
# or: bun add --global @koda-code/cli

cd path/to/project
koda
```

For a temporary invocation, use a package runner.

```bash
npx --yes --package @koda-code/cli koda
pnpm dlx --package @koda-code/cli koda
bunx --package @koda-code/cli koda
```

| Command | Purpose |
| --- | --- |
| `koda --help` | Inspect the command surface installed on this machine. |
| `koda run "<task>"` | Start a task from the shell. |
| `koda models` | List selectable provider models. |
| `koda auth` | Configure or inspect authentication. |
| `koda session list` | Review durable sessions. |
| `koda evolution status --json` | Inspect project-scoped retained lessons. |

Koda is terminal-only. Its public interface is the CLI and interactive terminal UI; it does not ship a browser console, web dashboard, or editor integration.

## Build the release packages

The public package is a cross-platform wrapper. A release build generates optional platform packages containing the compiled Koda binary, and the wrapper selects the correct artifact during installation.

```bash
# From the repository root
bun install --frozen-lockfile
bun run --cwd packages/opencode build
```

Use the package-local publisher only from a clean, reviewed release checkout. It prepares the wrapper and platform artifacts; it is not a shortcut for publishing the source workspace directly.

```bash
# Package inspection only
bun run --cwd packages/opencode script/publish.ts --npm-only --dry-run

# Publish after an authorized release review
bun run --cwd packages/opencode script/publish.ts --npm-only
```

Before publishing, authenticate to the npm account or organization that owns the `@koda-code` scope. Inspect the generated archives in `packages/opencode/dist` and verify the target version before making a public release.

## Develop and verify locally

Run the source entry point with the Node conditions used by the terminal CLI.

```bash
bun run --cwd packages/opencode --conditions=node src/index.ts --help
bun test --cwd packages/opencode test/koda
```

Read the repository-level [Koda guide](../../README.md) for product usage, [`AGENTS.md`](AGENTS.md) for package contribution rules, and [`../../TESTING.md`](../../TESTING.md) for server-focused terminal validation.

## License

MIT. See the repository [LICENSE](../../LICENSE).
