# Release Changesets

This directory holds release metadata consumed by the Koda publishing workflow. A changeset records the user-visible impact of a reviewed change so versioning and generated release notes remain deliberate.

## Add a changeset

Create one concise changeset for a user-facing change, grouping inseparable work when appropriate.

```bash
bunx changeset add
```

Alternatively, create `.changeset/<descriptive-slug>.md` with a package name, release type, and short operator-facing explanation.

```md
---
"@koda-code/cli": minor
---

Add bounded collaboration recovery controls to the terminal workflow.
```

| Release type | Use when |
| --- | --- |
| `patch` | Fixing behavior without changing the public contract. |
| `minor` | Adding backward-compatible functionality. |
| `major` | Introducing a deliberate breaking change. |

Keep entries concrete: describe the outcome for CLI users rather than the internal refactor. The terminal-only publish workflow consumes approved changesets during release preparation.
