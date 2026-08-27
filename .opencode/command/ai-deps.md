---
description: Audit eligible AI SDK dependency updates without modifying the lockfile
---

Review `package.json`, the relevant package manifests, and the locked dependency
graph for AI SDK and provider packages. Report only patch and minor updates unless
the user explicitly asks for a major-version assessment.

For each eligible update, provide the current version, candidate version, affected
Koda package, compatibility concern, and a trustworthy release-note or changelog
reference. Do not edit manifests, lockfiles, or generated files. Clearly separate
verified release information from versions that could not be confirmed.

If the dependency set is broad, delegate bounded research slices and synthesize a
single prioritized report. Keep credentials and private registry metadata out of
the output.
