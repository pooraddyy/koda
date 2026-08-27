# Migrating Configuration to Koda

Koda can adopt common repository instruction and agent-definition patterns without requiring a browser or editor integration. Migration is deliberately additive: inspect the imported result, keep the original source until it has been verified, and prefer Koda-native configuration for long-term maintenance.

## Migration strategy

| Stage | Objective | Evidence to keep |
|---|---|---|
| Discover | Identify existing agent, command, skill, rule, and MCP files. | File paths and a short purpose map. |
| Translate | Convert supported metadata into Koda configuration or Markdown frontmatter. | The proposed Koda file and its source counterpart. |
| Review | Check tool permissions, model choice, turn limits, and external endpoints. | A human approval decision for consequential access. |
| Verify | Launch Koda and confirm the command, agent, or skill appears as expected. | Exact command and observed result. |
| Retire | Remove the old file only after project owners agree on the replacement. | A focused commit and changelog note where relevant. |

Do not migrate secrets, access tokens, shell history, or opaque executable snippets into project configuration. Credentials belong in an approved secret-management path or a trusted user-level configuration layer.

## Agents and modes

Koda agent definitions are Markdown files with YAML frontmatter in `.koda/agent/` or `.koda/agents/`. Use the frontmatter to state a role, bounded execution budget, optional model selection, and permission policy. Keep the prompt body focused on the evidence the role must produce.

```md
---
name: test-investigator
display_name: Test Investigator
description: Reproduce a reported failure and define a narrow verification plan.
mode: subagent
steps: 10
permission:
  edit: deny
  bash: ask
---

Inspect the report and relevant source. Reproduce the smallest failure when
possible, identify likely ownership, and recommend the narrowest meaningful test.
Do not modify files. State uncertainty explicitly.
```

Supported metadata is normalized when imported from compatible Markdown agent directories. Koda remains the authority for task sessions, nested delegation, permissions, cancellation, budgets, cost accounting, retained context, and lifecycle records. Imported metadata does not automatically grant tool access or enable autonomous worktree operations.

## Commands and workflows

Move reusable terminal procedures into `.koda/command/<name>.md`. The filename becomes a slash command, and the command body can use `$1` through `$N`, `$ARGUMENTS`, file references, and explicitly evaluated command output.

```md
---
description: Investigate a regression before implementing a fix
agent: code
subtask: true
---

Investigate $ARGUMENTS. Reproduce the smallest failure, explain the likely
cause, propose the smallest safe change, and run focused verification only
after receiving the required permission.
```

Legacy workflow documents can usually become commands. Keep workflows scoped to a clear outcome, avoid hidden side effects, and split multi-hour changes into checkpoints with measurable acceptance criteria.

## Skills and repository rules

A Koda skill is a directory containing `SKILL.md` beneath `.koda/skill/` or `.koda/skills/`. Skills work well for specialized, repeatable engineering practices: a release checklist, a database migration review, or a security triage procedure. They should state when to use them, what evidence to collect, and which actions require approval.

Koda also honors repository instruction files such as `AGENTS.md`, `CLAUDE.md`, and `CONTEXT.md` when configured or discovered. Consolidate duplicated guidance rather than layering contradictory instructions. Current user instructions, permission rules, source state, and test results always take precedence over retained project notes.

## MCP servers and provider setup

Migrate external tool connections into the `mcp` configuration section only after reviewing the server's authority and data handling. Use the `/connect` terminal flow for provider authentication and custom OpenAI-compatible endpoints. Restrict automatic permissions for networked, write-capable, or destructive tools.

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

## Troubleshooting

If a command, agent, or skill does not appear, first confirm its directory and filename, then restart the terminal session from the intended project root. Inspect the active configuration with Koda's terminal commands and remove duplicate definitions one at a time. If a migrated rule behaves differently from its source, reduce it to a small reproducible configuration before adding more compatibility layers.

For the complete configuration model, see [`../skills/koda-config.md`](../skills/koda-config.md).
