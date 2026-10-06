<div align="center">

# Koda

### The Terminal AI Coding Agent

[![Release](https://img.shields.io/github/v/release/pooraddyy/koda?style=flat-square)](https://github.com/pooraddyy/koda/releases)
[![License](https://img.shields.io/github/license/pooraddyy/koda?style=flat-square)](./LICENSE)
[![Platform](https://img.shields.io/badge/platform-linux%20%7C%20macos%20%7C%20windows-lightgrey?style=flat-square)](https://github.com/pooraddyy/koda/releases)

**Write code, run commands, and ship faster — directly from your terminal.**

[Installation](#installation) · [Features](#features) · [Quick Start](#quick-start) · [Documentation](#configuration) · [Contributing](#contributing)

</div>

> **Note:** Koda is built using [OpenCode](https://github.com/sst/opencode) as its foundation. This is a beta version — you may encounter bugs, glitches, or unexpected behavior. Please report issues on the [issues page](https://github.com/pooraddyy/koda/issues).

---

## Overview

Koda is a terminal-native AI coding agent that brings the power of large language models directly into your development workflow. No browser tabs, no context switching — just you, your terminal, and an intelligent assistant that understands your codebase.

Built for developers who live in the terminal, Koda combines agentic code editing, shell execution, web research, and project management into a single, fast, keyboard-driven interface.

## Features

### Core Capabilities

| Feature | Description |
|---------|-------------|
| **Agentic Coding** | Autonomous code editing, refactoring, and generation with LSP-powered diagnostics |
| **100+ LLM Providers** | Native support for Anthropic, OpenAI, Google, and any OpenAI-compatible API |
| **Custom Providers** | Connect any OpenAI-compatible endpoint via the `/connect` wizard |
| **Deep Research** | Multi-stage research combining web search, content extraction, and synthesis |
| **Telegram Integration** | Control Koda remotely via Telegram bot with background task updates |
| **Background Agents** | Run subagents asynchronously while you continue working |
| **Session Management** | Persistent, resumable, and shareable coding sessions |
| **Checkpoints** | Snapshot-based revert for any point in your session |
| **MCP Support** | Extend capabilities with any Model Context Protocol server |

### Developer Experience

- **Terminal-First Design** — Beautiful TUI with keyboard-driven navigation
- **LSP Integration** — Real-time diagnostics feed back into the agent automatically
- **Headless Mode** — Run non-interactively in scripts and CI pipelines
- **Custom Agents** — Define specialized subagents for your workflow
- **Long-Running Tasks** — Bash commands support up to 2-hour timeouts for builds and tests

## Installation

### Quick Install

```bash
curl -fsSL https://raw.githubusercontent.com/pooraddyy/koda/dev/install.sh | bash
```

### Manual Installation

Download the latest release for your platform from the [releases page](https://github.com/pooraddyy/koda/releases).

**Available platforms:**
- Linux x64
- macOS (ARM64, x64)
- Windows x64

### Build from Source

```bash
git clone https://github.com/pooraddyy/koda.git
cd koda
bun install
bun run build
```

## Quick Start

1. **Launch Koda:**
   ```bash
   koda
   ```

2. **Connect a provider:**
   Type `/connect` and follow the wizard, or choose from 100+ built-in providers.

3. **Start coding:**
   ```
   > Refactor the authentication module to use JWT tokens
   > Add unit tests for the payment processor
   > Research the latest React Server Components patterns
   ```

### Headless Mode

```bash
# Single prompt
koda run "Explain this codebase structure"

# With specific model
koda run --model anthropic/claude-sonnet-4 "Fix the failing tests"

# Continue last session
koda run --continue "Now add integration tests"
```

## Deep Research

Koda includes a powerful deep research engine for multi-stage investigation:

```bash
# In TUI, use the deep_research tool or:
/research artificial intelligence trends in 2026
```

**How it works:**
1. Generates diverse search queries covering multiple angles
2. Searches the web and extracts content from top sources
3. Identifies key learnings, metrics, and entities
4. Follows up with deeper queries on interesting threads
5. Synthesizes everything into a comprehensive report with sources

**Parameters:**
- `breadth` (1-10): Number of angles to explore (default: 3)
- `depth` (1-3): Follow-up research depth (default: 2)

## Telegram Integration

Control Koda remotely via Telegram:

1. **Connect:** Use the Telegram setup dialog in TUI (bot token from [@BotFather](https://t.me/BotFather), admin ID from [@userinfobot](https://t.me/userinfobot))

2. **Commands:**
   ```
   /research <topic>          Start deep research
   /research <topic> | 2h     Research with 2-hour limit
   /research <topic> | 30m    Updates every 30 minutes
   /stop                      Stop all research tasks
   /status                    Show active tasks
   /help                      Show all commands
   ```

3. **Direct Chat:** Send any message to chat with Koda directly

**Background Updates:** Research tasks run as background subagents and send periodic progress updates to Telegram based on your configured interval.

## Configuration

Koda uses `koda.json` for configuration:

```json
{
  "provider": {
    "my-custom": {
      "name": "My Provider",
      "npm": "@ai-sdk/openai-compatible",
      "env": ["MY_API_KEY"],
      "options": {
        "baseURL": "https://api.example.com/v1"
      },
      "models": {
        "my-model": {
          "name": "My Model"
        }
      }
    }
  },
  "theme": "kilo",
  "model": "anthropic/claude-sonnet-4"
}
```

**Config locations:**
- Global: `~/.config/koda/koda.json`
- Project: `./koda.json` (or `.koda/koda.json`)

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+P` | Command palette |
| `Ctrl+O` | Model selector |
| `Tab` | Accept suggestion |
| `Esc` | Cancel / Go back |
| `/` | Slash commands |
| `@` | File mentions |

Type `/help` in Koda for the full command list.

## Architecture

**Key components:**
- **Agent Engine** (`packages/koda`) — Session management, tool orchestration, LLM integration
- **TUI** (`packages/tui`) — Reactive terminal interface built with OpenTUI
- **Tools** — File editing, bash execution, web search, LSP, deep research, Telegram
- **Providers** — Unified interface for 100+ LLM providers via AI SDK

## Contributing

Contributions are welcome! Please follow these guidelines:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

**Development setup:**
```bash
git clone https://github.com/pooraddyy/koda.git
cd koda
bun install
bun run dev
```

## License

This project is licensed under the MIT License — see the [LICENSE](./LICENSE) file for details.

## Acknowledgments

- Built on the [AI SDK](https://sdk.vercel.ai/) by Vercel
- Terminal UI powered by [OpenTUI](https://github.com/sst/opentui)

---

<div align="center">

**Built for developers who live in the terminal.**

[Report Bug](https://github.com/pooraddyy/koda/issues) · [Request Feature](https://github.com/pooraddyy/koda/issues) · [Releases](https://github.com/pooraddyy/koda/releases)

</div>
