# Contributing to Koda

Thank you for your interest in contributing to Koda. This document will guide you through the process.

> **Note:** Koda is built on [OpenCode](https://github.com/sst/opencode). This is a beta project — contributions that improve stability and fix bugs are especially welcome.

## Types of Contributions

We welcome the following types of contributions:

- **Bug fixes** — Help us stabilize the beta
- **New LLM provider support** — Expand compatibility
- **LSP and formatter integrations** — Better language support
- **Performance improvements** — Make Koda faster
- **Documentation** — Improve guides, examples, and references
- **Environment-specific fixes** — Platform quirks and compatibility

## Getting Started

### Prerequisites

- [Bun](https://bun.sh/) 1.3 or later
- Git

### Development Setup

1. Fork the repository on GitHub
2. Clone your fork:
   ```bash
   git clone https://github.com/YOUR_USERNAME/koda.git
   cd koda
   ```
3. Install dependencies:
   ```bash
   bun install
   ```
4. Start the development server:
   ```bash
   bun dev
   ```

### Project Structure

- `packages/koda` — Core agent logic, tools, sessions, and server
- `packages/tui` — Terminal user interface (SolidJS with OpenTUI)
- `packages/core` — Shared utilities, tools, and effects
- `packages/plugin` — Plugin system source

## Making Changes

1. Create a feature branch:
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. Make your changes following the style guide in [AGENTS.md](./AGENTS.md)

3. Test your changes:
   ```bash
   # Typecheck
   bun typecheck

   # Build
   bun run build

   # Run relevant tests
   bun test
   ```

4. Commit with a descriptive message:
   ```bash
   git commit -m "feat: add your feature description"
   ```

5. Push and open a Pull Request

## Pull Request Guidelines

### Before Opening a PR

- Open an issue first describing the bug or feature
- Reference the issue in your PR with `Fixes #123` or `Closes #123`
- Keep PRs small and focused — one change per PR

### PR Requirements

- **Clear title** following conventional commits:
  - `feat:` — New feature
  - `fix:` — Bug fix
  - `docs:` — Documentation changes
  - `chore:` — Maintenance tasks
  - `refactor:` — Code refactoring
  - `test:` — Test additions or updates

- **Description** explaining:
  - What changed and why
  - How you verified it works
  - How a reviewer can reproduce the fix

- **UI changes** must include before/after screenshots or videos

### Code Style

Follow the guidelines in [AGENTS.md](./AGENTS.md):

- Keep functions focused and composable
- Prefer immutable patterns, avoid unnecessary `let`
- Use precise types, avoid `any`
- Prefer `.catch()` over `try`/`catch` where appropriate
- Use Bun runtime APIs (e.g., `Bun.file()`) when suitable

## Adding New Providers

New LLM providers typically do not require code changes. Koda supports any OpenAI-compatible API through configuration:

```json
{
  "provider": {
    "my-provider": {
      "npm": "@ai-sdk/openai-compatible",
      "options": { "baseURL": "https://api.example.com/v1" },
      "models": { "my-model": { "name": "My Model" } }
    }
  }
}
```

For providers needing custom SDK integration, open an issue first to discuss the approach.

## Reporting Issues

Use the appropriate issue template:

- **Bug report** — Describe the bug, steps to reproduce, expected behavior
- **Feature request** — Describe the problem and proposed solution
- **Question** — Ask about usage or behavior

Include:
- Koda version (`koda --version`)
- Operating system and version
- Relevant configuration (redact API keys)
- Steps to reproduce (for bugs)
- Expected vs actual behavior

## Feature Requests

For new functionality:

1. Open an issue describing the problem
2. Propose your approach (optional)
3. Wait for maintainer feedback before implementing

This ensures alignment and prevents duplicate work.

## License

By contributing to Koda, you agree that your contributions will be licensed under the MIT License. See [LICENSE](./LICENSE) for details.

## Questions?

- Open a [discussion](https://github.com/pooraddyy/koda/discussions)
- Report bugs via [issues](https://github.com/pooraddyy/koda/issues)
