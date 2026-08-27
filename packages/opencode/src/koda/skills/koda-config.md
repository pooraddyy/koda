# Koda Configuration Reference

Koda configuration controls the terminal workflow: models, providers, permissions, commands, agents, skills, plugins, sessions, and TUI behavior. Keep credentials outside repository files whenever possible and treat project-level configuration as executable instruction surface that deserves review.

## Configuration precedence

Koda merges configuration from progressively more specific sources. Later applicable sources override earlier values while nested objects are merged by key.

| Precedence | Source | Typical use |
|---|---|---|
| Low | Global config in `~/.config/koda/` | Personal defaults and provider setup. |
| Medium | Project `koda.json` or `koda.jsonc` | Repository-specific model, permissions, and plugin policy. |
| Medium | Project `.koda/` configuration directory | Commands, agents, skills, themes, and local TUI settings. |
| High | `koda_CONFIG` or `koda_CONFIG_DIR` | Explicit config file or directory supplied by the operator. |
| High | `koda_CONFIG_CONTENT` | Short-lived inline JSON configuration. |
| Highest | Managed configuration | Organization-managed policy where supported. |

Start with one global file and one project file. Add more layers only when a team needs a clearly defined local override.

```jsonc
// koda.jsonc
{
  "$schema": "https://app.koda.ai/config.json",
  "model": "anthropic/claude-sonnet",
  "small_model": "anthropic/claude-haiku",
  "permission": {
    "edit": { "src/**": "allow", "*": "ask" },
    "bash": "ask"
  }
}
```

## Commands

Markdown files in `.koda/command/` or `.koda/commands/` become TUI slash commands. The filename, without `.md`, is the command name. A command can route to a named agent, select a model, or run as a bounded subtask.

```md
---
description: Reproduce and verify a focused regression
agent: code
subtask: true
---

Reproduce the failure described by $ARGUMENTS. Make the smallest justified
change, run the narrowest relevant check, and report the evidence.
```

Use `$1` through `$N` for positional arguments and `$ARGUMENTS` for the full argument string. Commands may reference project files with `@path/to/file` and command output with `` !`command` ``. Keep command templates reviewable and avoid embedding secrets or irreversible actions.

## Agents

Agent definitions live in `.koda/agent/` or `.koda/agents/`. The frontmatter sets selection, tool availability, and turn limits; the body describes the role and expected evidence.

```md
---
name: security-review
display_name: Security Review
description: Review a proposed change for security regressions.
mode: subagent
steps: 12
permission:
  edit: deny
  bash: ask
---

Inspect the requested change with read-only tools. Report concrete findings
with severity, file paths, rationale, and a verification recommendation.
```

| Field | Meaning |
|---|---|
| `mode` | `primary` is selectable as the main agent, `subagent` runs through task delegation, and `all` permits both. |
| `model` | Optional `provider/model` override for the role. |
| `steps` | Positive limit on agentic iterations. |
| `hidden` | Hides a subagent from normal selection menus. |
| `permission` | Adds role-specific tool approval rules. |

External Markdown agent definitions may be imported from compatible agent directories, but only their supported metadata is normalized. Koda continues to own child-session creation, cancellation, cost rollup, permissions, context, and lifecycle state.

## Permissions

Permissions are evaluated as ordered rules. Use explicit approvals as the normal default and make automated allowances narrow enough that another maintainer can understand them quickly.

```jsonc
{
  "permission": {
    "read": "allow",
    "edit": {
      "src/**": "ask",
      "*.lock": "deny",
      "*": "ask"
    },
    "bash": "ask",
    "external_directory": "deny"
  }
}
```

Each action is `allow`, `ask`, or `deny`. Use `null` to remove an inherited rule. Built-in tools include read, edit, glob, grep, list, bash, task, web fetch/search, semantic search, memory, language-server, skill, external-directory, todo, and question capabilities. Do not auto-approve networked or destructive actions merely because they are common in a development workflow.

## Providers and custom endpoints

The interactive `/connect` flow is the preferred way to add a provider or custom OpenAI-compatible model. For managed configuration, provider options can be declared in JSON. Keep API keys in environment variables or trusted global configuration rather than committed project files.

```jsonc
{
  "provider": {
    "custom": {
      "options": {
        "baseURL": "https://provider.example/v1",
        "timeout": 300000
      },
      "models": {
        "engineering-model": { "name": "Engineering Model" }
      }
    }
  },
  "enabled_providers": ["custom"]
}
```

`disabled_providers` hides named providers from the automatically loaded set. `enabled_providers` is stricter: when present, only listed providers are enabled. If both are present, a provider must be enabled and not disabled to appear.

## MCP servers and plugins

MCP servers add external tool surfaces. Local servers execute a command; remote servers use a URL and may require headers or OAuth. Every server should have a clear owner, minimal permission rules, and a tested failure mode before it is shared with a team.

```jsonc
{
  "mcp": {
    "issue-tracker": {
      "type": "remote",
      "url": "https://mcp.example.com",
      "enabled": true,
      "timeout": 10000
    }
  },
  "permission": {
    "issue_tracker_*": "ask"
  }
}
```

To disable an inherited server, set the matching entry to `{ "enabled": false }`. Add npm or local plugins with the top-level `plugin` array only after reviewing their source and requested capabilities.

## Skills and instructions

Skills are named directories with a `SKILL.md` entry point beneath `.koda/skill/` or `.koda/skills/`. A skill should have concise frontmatter, a clear trigger condition, safe defaults, and local references to any helper scripts.

```md
---
name: focused-regression
description: Use when a change needs a narrow reproducible test before implementation.
---

Reproduce the reported failure, identify the smallest relevant test surface,
and preserve unrelated behavior.
```

Additional instruction files may be supplied through the `instructions` configuration field. Treat all instruction content as project-controlled input and review it before granting tools or credentials.

## TUI settings

Use the command palette and slash commands to change interactive settings. These settings are intentionally operator-controlled: an agent should explain where to change a setting rather than silently changing user preferences.

| Category | Typical controls |
|---|---|
| Models and agents | `/models`, `/agents`, and the command palette. |
| Sessions | `/new`, `/sessions`, `/rename`, `/timeline`, `/compact`, `/undo`, and `/redo`. |
| Collaboration | `/collaboration` for bounded collaborative task modes. |
| Provider setup | `/connect` for authentication and custom endpoints. |
| Visual controls | Command-palette entries for themes, layout, timestamps, thinking, tool details, and animations. |
| Notifications | `attention` settings in `tui.json` or `tui.jsonc`. |

Place project-local themes in `.koda/themes/`. Use `tui.json` or `tui.jsonc` for durable terminal preferences that a team has agreed to share.

## Environment overrides

| Variable | Effect |
|---|---|
| `koda_CONFIG` | Loads an additional explicitly selected configuration file. |
| `koda_CONFIG_DIR` | Adds an explicitly selected configuration directory. |
| `koda_CONFIG_CONTENT` | Merges inline JSON configuration at high precedence. |
| `koda_DISABLE_PROJECT_CONFIG` | Skips project-level configuration files and directories. |
| `koda_TUI_CONFIG` | Loads an explicitly selected terminal-UI configuration file. |
| `koda_DISABLE_DEFAULT_PLUGINS` | Prevents Koda's default plugins from loading. |

Use environment overrides for controlled automation, test isolation, or temporary diagnostics. Avoid persisting provider secrets in shell profiles or CI logs; prefer an approved secret-management path.
