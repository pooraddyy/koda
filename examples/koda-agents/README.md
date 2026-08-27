# Koda Agent Examples

These examples demonstrate small, bounded agent definitions for a terminal Koda project. They are starting points, not universal policy: review every tool rule, model selection, and turn limit against the repository that will load them.

## Use an example

Copy one definition into the target repository, then adapt its scope before running Koda.

```bash
mkdir -p .koda/agents
cp examples/koda-agents/repository-scout.md .koda/agents/
```

Start Koda from that repository and select the agent when delegating a task. Keep roles narrow: a scout maps the codebase, a security reviewer reports risks, and the primary agent retains responsibility for implementation and final verification.

| Example | Appropriate use | Default authority |
|---|---|---|
| `repository-scout.md` | First-pass orientation in an unfamiliar repository. | Read-only investigation and a concise repository map. |
| `security-review.md` | Pre-merge review of a bounded change. | Read-only findings with evidence and remediation guidance. |

For the complete frontmatter and permission model, read the [Koda configuration reference](../../packages/opencode/src/koda/skills/koda-config.md).
