---
description: Investigate a GitHub issue and produce an implementation-ready triage
---

Analyze the issue described by $ARGUMENTS against the current repository state.
Reproduce the behavior when it is safe and practical, locate likely ownership, and
separate confirmed facts from assumptions.

Return a concise triage containing severity or user impact, reproduction status,
affected paths, likely root-cause area, proposed acceptance criteria, and the
narrowest verification command. Do not assign users, add labels, create issues, or
change code unless the user explicitly requests that action.
