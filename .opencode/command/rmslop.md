---
description: Review a change for unnecessary complexity, weak evidence, and generic implementation patterns
---

Review the requested change as a pragmatic maintainer. Look for duplicated logic,
unreachable branches, speculative abstractions, inconsistent naming, unbounded
automation, misleading comments, and tests that do not prove the reported behavior.

Prioritize findings by maintainability and correctness impact. Each finding must
cite a file path and explain the smallest justified improvement. Preserve working,
intentional code; do not propose a redesign merely for stylistic novelty. End with
the focused checks that would demonstrate the review has been addressed.
