---
description: Prepare a safe, reviewable Git commit for the current Koda change
---

Inspect the working tree, staged diff, repository status, and the narrowest
relevant validation results. Identify unrelated files, generated artifacts,
credentials, and large accidental changes before proposing a commit.

Recommend one concise conventional commit subject that describes the user-visible
outcome. Stage only the reviewed files and run `git diff --cached --check` before
committing. Never force-push, rewrite history, resolve merge conflicts by
discarding changes, or publish a remote change without explicit user approval.

Report the committed hash, exact files included, and tests that did or did not run.
