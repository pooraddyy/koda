<p align="center">The open source AI coding agent.</p>
<p align="center">
  <a href="https://koda.ai/discord"><img alt="Discord" src="https://img.shields.io/discord/1391832426048651334?style=flat-square&label=discord" /></a>
  <a href="https://www.npmjs.com/package/koda-ai"><img alt="npm" src="https://img.shields.io/npm/v/koda-ai?style=flat-square" /></a>
  <a href="https://github.com/iiaddy/opencode-cli/actions/workflows/publish.yml"><img alt="Build status" src="https://img.shields.io/github/actions/workflow/status/iiaddy/opencode-cli/publish.yml?style=flat-square&branch=dev" /></a>
</p>

<p align="center">
  <a href="README.md">English</a> |
  <a href="README.zh.md">简体中文</a> |
  <a href="README.zht.md">繁體中文</a> |
  <a href="README.ko.md">한국어</a> |
  <a href="README.de.md">Deutsch</a> |
  <a href="README.es.md">Español</a> |
  <a href="README.fr.md">Français</a> |
  <a href="README.it.md">Italiano</a> |
  <a href="README.da.md">Dansk</a> |
  <a href="README.ja.md">日本語</a> |
  <a href="README.pl.md">Polski</a> |
  <a href="README.ru.md">Русский</a> |
  <a href="README.bs.md">Bosanski</a> |
  <a href="README.ar.md">العربية</a> |
  <a href="README.no.md">Norsk</a> |
  <a href="README.br.md">Português (Brasil)</a> |
  <a href="README.th.md">ไทย</a> |
  <a href="README.tr.md">Türkçe</a> |
  <a href="README.uk.md">Українська</a> |
  <a href="README.bn.md">বাংলা</a> |
  <a href="README.gr.md">Ελληνικά</a> |
  <a href="README.vi.md">Tiếng Việt</a>
</p>

[![Koda Terminal UI](packages/web/src/assets/lander/screenshot.png)](https://koda.ai)

---

### Installation

```bash
# YOLO
curl -fsSL https://koda.ai/install | bash

# Package managers
npm i -g koda-ai@latest        # or bun/pnpm/yarn
scoop install koda             # Windows
choco install koda             # Windows
brew install iiaddy/tap/koda # macOS and Linux (recommended, always up to date)
brew install koda              # macOS and Linux (official brew formula, updated less)
sudo pacman -S koda            # Arch Linux (Stable)
paru -S koda-bin               # Arch Linux (Latest from AUR)
mise use -g koda               # Any OS
nix run nixpkgs#koda           # or github:iiaddy/opencode-cli for latest dev branch
```

> [!TIP]
> Remove versions older than 0.1.x before installing.

### Desktop App (BETA)

Koda is also available as a desktop application. Download directly from the [releases page](https://github.com/iiaddy/opencode-cli/releases) or [koda.ai/download](https://koda.ai/download).

| Platform              | Download                           |
| --------------------- | ---------------------------------- |
| macOS (Apple Silicon) | `koda-desktop-mac-arm64.dmg`   |
| macOS (Intel)         | `koda-desktop-mac-x64.dmg`     |
| Windows               | `koda-desktop-windows-x64.exe` |
| Linux                 | `.deb`, `.rpm`, or `.AppImage`     |

```bash
# macOS (Homebrew)
brew install --cask koda-desktop
# Windows (Scoop)
scoop bucket add extras; scoop install extras/koda-desktop
```

#### Installation Directory

The install script respects the following priority order for the installation path:

1. `$KODA_INSTALL_DIR` - Custom installation directory
2. `$XDG_BIN_DIR` - XDG Base Directory Specification compliant path
3. `$HOME/bin` - Standard user binary directory (if it exists or can be created)
4. `$HOME/.koda/bin` - Default fallback

```bash
# Examples
KODA_INSTALL_DIR=/usr/local/bin curl -fsSL https://koda.ai/install | bash
XDG_BIN_DIR=$HOME/.local/bin curl -fsSL https://koda.ai/install | bash
```

### Agents

Koda includes two built-in agents you can switch between with the `Tab` key.

- **build** - Default, full-access agent for development work
- **plan** - Read-only agent for analysis and code exploration
  - Denies file edits by default
  - Asks permission before running bash commands
  - Ideal for exploring unfamiliar codebases or planning changes

Also included is a **general** subagent for complex searches and multistep tasks.
This is used internally and can be invoked using `@general` in messages.

Learn more about [agents](https://koda.ai/docs/agents).

### Documentation

For more info on how to configure Koda, [**head over to our docs**](https://koda.ai/docs).

### Contributing

If you're interested in contributing to Koda, please read our [contributing docs](./CONTRIBUTING.md) before submitting a pull request.

### Building on Koda

If you are working on a project that's related to Koda and is using "koda" as part of its name, for example "koda-dashboard" or "koda-mobile", please add a note to your README to clarify that it is not built by the Koda team and is not affiliated with us in any way.

---

**Join our community** [Discord](https://discord.gg/koda) | [X.com](https://x.com/koda)
