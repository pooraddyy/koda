# Security Policy

## Reporting Security Issues

We take security seriously. If you discover a security vulnerability in Koda, please report it responsibly.

**To report a vulnerability:**

Use the GitHub Security Advisory ["Report a Vulnerability"](https://github.com/pooraddyy/koda/security/advisories/new) tab.

We will acknowledge your report and keep you informed of progress toward a fix. Please do not disclose the vulnerability publicly until we have had a chance to address it.

> **Note:** We do not accept AI-generated security reports. Automated submissions without human verification will not be reviewed.

## Threat Model

### Overview

Koda is an AI-powered coding assistant that runs locally on your machine. It provides an agent system with access to powerful tools including shell execution, file operations, and web access.

### No Sandbox

Koda does **not** sandbox the agent. The permission system exists as a UX feature to help users stay aware of what actions the agent is taking — it prompts for confirmation before executing commands, writing files, etc. However, it is not designed to provide security isolation.

If you need true isolation, run Koda inside a Docker container or virtual machine.

### Server Mode

Server mode is opt-in only. When enabled, set `KODA_SERVER_PASSWORD` to require HTTP Basic Auth. Without this, the server runs unauthenticated (with a warning). It is the end user's responsibility to secure the server — any functionality it provides is not a vulnerability.

### Telegram Integration

When using the Telegram bot integration:

- Only the configured admin ID can interact with the bot
- The bot token should be treated as a secret — never commit it to version control
- Bot tokens can be revoked and regenerated via [@BotFather](https://t.me/BotFather)

### Out of Scope

| Category                        | Rationale                                                               |
| ------------------------------- | ----------------------------------------------------------------------- |
| **Server access when opted-in** | If you enable server mode, API access is expected behavior              |
| **Sandbox escapes**             | The permission system is not a sandbox (see above)                      |
| **LLM provider data handling**  | Data sent to your configured LLM provider is governed by their policies |
| **MCP server behavior**         | External MCP servers you configure are outside our trust boundary       |
| **Malicious config files**      | Users control their own config; modifying it is not an attack vector    |

## Supported Versions

| Version        | Supported   |
| -------------- | ----------- |
| Latest release | Yes         |
| Older releases | Best effort |

We recommend always using the latest release for the most up-to-date security fixes.

## Security Best Practices for Users

- Keep Koda updated to the latest version
- Use `KODA_SERVER_PASSWORD` when running in server mode
- Review agent actions before approving them
- Do not share your API keys or bot tokens
- Run Koda in a container or VM when working with untrusted code
