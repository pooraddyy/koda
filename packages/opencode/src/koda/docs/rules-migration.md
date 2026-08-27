# Migrating Repository Rules to Koda

Repository rules should make engineering work safer and more repeatable, not obscure ownership or override operator control. Koda uses instruction files and configuration rules as context for a terminal session; it does not treat them as unconditional authority.

## Principles

| Principle | Practical meaning |
|---|---|
| Add before removing | Keep the previous rule until the Koda replacement has been reviewed and exercised. |
| Prefer one source of truth | Consolidate duplicated policies into the nearest relevant project instruction file. |
| Keep scope narrow | State the affected paths, commands, and acceptance criteria rather than a vague preference. |
| Preserve approval boundaries | A rule must not silently broaden permission for shell, edits, network access, or credentials. |
| Verify behavior | Exercise the rule in a small task and capture the resulting terminal behavior. |

## Recommended structure

Use `AGENTS.md` for repository-wide engineering rules, package-level `AGENTS.md` files for local conventions, and the `instructions` field in `koda.json` when extra files need explicit inclusion. Keep durable settings such as providers and tool permissions in `koda.json` or `koda.jsonc`.

```md
# API package rules

Change public request schemas deliberately. Add a focused regression test for
observable behavior, preserve authorization checks, and run the package-local
test command before reporting completion.
```

Avoid instructions that depend on a particular GUI, editor plugin, or private local machine state. Terminal commands and file paths should work from a clean checkout or clearly state the prerequisite that makes them environment-specific.

## Migrate safely

1. List the old rule files and identify their actual purpose.
2. Remove obsolete branding, tool references, and duplicate policy language.
3. Translate the remaining behavior into an `AGENTS.md` file or explicit Koda configuration.
4. Start a fresh terminal session and ask for a narrow task governed by the rule.
5. Confirm that the resulting plan, permission requests, and test recommendation match the intended scope.
6. Delete the superseded rule only after the project owner accepts the replacement.

## Common problems

| Symptom | Likely cause | First check |
|---|---|---|
| Rules appear to conflict | Multiple instruction files describe the same decision differently. | Consolidate the policy and make the remaining hierarchy explicit. |
| An instruction is ignored | The file is outside a discovered path or omitted from configured instructions. | Confirm the current project root and configuration search path. |
| The agent proposes unsafe work | Rules are vague or permissions are too broad. | State the approval boundary and use `ask` or `deny` for sensitive tools. |
| A migration changes behavior unexpectedly | Old metadata contained tool- or platform-specific assumptions. | Recreate the smallest rule and verify it in a fresh session. |

Configuration details, permission syntax, and discovery paths are documented in [`../skills/koda-config.md`](../skills/koda-config.md).
