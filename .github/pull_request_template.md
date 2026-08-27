# Koda Change Record

## Outcome

<!-- State the user or engineering outcome in one or two sentences. Link the issue with `Fixes #123` when applicable. -->

## Scope and design

<!-- Explain the smallest meaningful implementation, important trade-offs, compatibility considerations, and any permissions, safety, or lifecycle behavior affected. Do not repeat details already obvious in the diff. -->

## Verification evidence

| Area | Command or review performed | Result |
|---|---|---|
| Focused behavior | <!-- Example: `bun test --cwd packages/opencode test/koda/...` --> | <!-- pass / limitation --> |
| Terminal workflow | <!-- Example: `koda --help` or a reproducible manual step --> | <!-- observed result --> |
| Documentation or configuration | <!-- Link, lint, or static check when relevant --> | <!-- observed result --> |

If a relevant check cannot run, state the exact command, the blocker, and the best substitute evidence. Do not use a bare “not tested” statement for a ready-for-review change.

## Reviewer guidance

<!-- Call out files, commands, permission decisions, migrations, or risk areas that deserve deliberate review. Leave blank when the diff is self-contained. -->

## Checklist

- [ ] The change has a clear outcome and a deliberately limited scope.
- [ ] I reviewed the final diff and removed accidental files, credentials, and generated noise.
- [ ] Relevant validation evidence is recorded above.
- [ ] User-facing behavior, configuration, and migration impact are documented where applicable.
- [ ] I considered a changeset for a user-visible package change.
