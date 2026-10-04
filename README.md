<div align="center">

# Koda

**The terminal AI coding agent.**

[![Release](https://img.shields.io/github/v/release/pooraddyy/koda?style=flat-square)](https://github.com/pooraddyy/koda/releases)
[![Build](https://img.shields.io/github/actions/workflow/status/pooraddyy/koda/publish.yml?style=flat-square&branch=dev)](https://github.com/pooraddyy/koda/actions)
[![License](https://img.shields.io/github/license/pooraddyy/koda?style=flat-square)](./LICENSE)

Write code, run commands, and ship faster — right from your terminal.

</div>

---

## Features

- **Terminal-first** — a full AI coding agent that lives in your terminal, no browser or desktop app needed
- **100+ LLM providers** — works with Anthropic, OpenAI, Google, and any OpenAI-compatible API
- **Agentic tools** — file editing, bash execution, web search, LSP-powered navigation, and more
- **Model Context Protocol** — connect any MCP server to extend Koda's capabilities
- **Sessions** — every conversation is saved, resumable, shareable, and exportable
- **Custom agents** — built-in `build` and `plan` agents, plus your own via config
- **Headless mode** — run it non-interactively in scripts and CI with `koda run`

## Installation

```bash
curl -fsSL https://raw.githubusercontent.com/pooraddyy/koda/dev/install.sh | bash
```

<details>
<summary>More install options</summary>

<br>

**Custom install directory:**

```bash
KODA_INSTALL_DIR=/usr/local/bin curl -fsSL https://raw.githubusercontent.com/pooraddyy/koda/dev/install.sh | bash
XDG_BIN_DIR=$HOME/.local/bin curl -fsSL https://raw.githubusercontent.com/pooraddyy/koda/dev/install.sh | bash
```

The installer picks the directory in this order: `$KODA_INSTALL_DIR` → `$XDG_BIN_DIR` → `$HOME/bin` → `$HOME/.koda/bin`.

**Specific version:**

```bash
curl -fsSL https://raw.githubusercontent.com/pooraddyy/koda/dev/install.sh | bash -s -- --version 1.0.180
```

**From a local binary:**

```bash
./install.sh --binary /path/to/koda
```

</details>

## Quick Start

```bash
# Start the interactive TUI (default)
koda

# Run a one-shot prompt without the TUI
koda run "explain this codebase"

# Continue where you left off
koda run --continue "now add tests"
```

On first run, Koda walks you through connecting a provider. You can also manage providers anytime:

```bash
koda providers   # add / remove AI providers and credentials (alias: auth)
koda models      # list available models
```

## Commands

| Command | Description |
| ------- | ----------- |
| `koda [project]` | Start the interactive TUI (default) |
| `koda run [message..]` | Run Koda with a message, non-interactively |
| `koda serve` | Start a headless Koda server |
| `koda attach <url>` | Attach to a running Koda server |
| `koda session` | Manage sessions |
| `koda agent` | Manage agents |
| `koda mcp` | Manage MCP (Model Context Protocol) servers |
| `koda acp` | Start ACP (Agent Client Protocol) server |
| `koda providers` | Manage AI providers and credentials |
| `koda models [provider]` | List all available models |
| `koda plugin <module>` | Install a plugin |
| `koda export [sessionID]` | Export session data as JSON |
| `koda import <file>` | Import session data from a JSON file or URL |
| `koda stats` | Show token usage and cost statistics |
| `koda upgrade [target]` | Upgrade Koda to the latest or a specific version |
| `koda uninstall` | Uninstall Koda and remove all related files |
| `koda github` | Manage the GitHub agent |
| `koda pr <number>` | Fetch a GitHub PR branch, then run Koda |
| `koda debug` | Debugging and troubleshooting tools |
| `koda db` | Database tools |
| `koda completion` | Generate shell completion script |

Run `koda <command> --help` for details on any command.

## Configuration

Koda is configured via `koda.json` in your project or global config directory:

```json
{
  "$schema": "https://models.koda.ai/config.json",
  "model": "anthropic/claude-sonnet-4-20250514",
  "theme": "system"
}
```

See the [example config](./.koda/koda.jsonc) in this repo for all available options.

## Agents

Koda ships with two built-in agents — switch between them with the `Tab` key:

| Agent | Description |
| ----- | ----------- |
| `build` | Default agent with full access for development work |
| `plan` | Read-only agent for analysis and exploration — denies edits, asks before running commands |

A `general` subagent is also available for complex searches and multi-step tasks (invoke with `@general`).

## Development

```bash
# Install dependencies
bun install

# Build the binary
cd packages/koda && bun ./script/build.ts

# Run it
./packages/koda/dist/koda-linux-x64/bin/koda --help

# Run tests
bun test

# Typecheck
bun typecheck
```

Requires [Bun](https://bun.sh). See [CONTRIBUTING.md](./CONTRIBUTING.md) for details.

## Contributing

Contributions are welcome. Please read [CONTRIBUTING.md](./CONTRIBUTING.md) before submitting a pull request.

## License

[MIT](./LICENSE) — Copyright (c) 2025 koda.
