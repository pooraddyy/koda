#!/usr/bin/env bun
// koda_change - new file

/**
 * Guards generated koda config dependency artifacts.
 *
 * koda loads project config from .koda/ and .koda/ and installs
 * @koda/plugin there at runtime. npm writes package.json, lockfiles,
 * .gitignore, and node_modules as generated local state. These paths must stay
 * untracked so background installs do not create recurring branch diffs.
 */

import { spawnSync } from "node:child_process"

const paths = [
  ".koda/.gitignore",
  ".koda/package.json",
  ".koda/package-lock.json",
  ".koda/pnpm-lock.yaml",
  ".koda/bun.lock",
  ".koda/yarn.lock",
  ".koda/node_modules",
  ".koda/.gitignore",
  ".koda/package.json",
  ".koda/package-lock.json",
  ".koda/pnpm-lock.yaml",
  ".koda/bun.lock",
  ".koda/yarn.lock",
  ".koda/node_modules",
]

const git = spawnSync("git", ["ls-files", "-z", "--", ...paths], { encoding: "utf8" })

if (git.status !== 0) {
  console.error(git.stderr.trim() || "git ls-files failed")
  process.exit(1)
}

const bad = git.stdout.split("\0").filter(Boolean).sort()

if (bad.length === 0) {
  console.log("check-koda-generated-artifacts: ok")
  process.exit(0)
}

console.error("Generated koda config dependency artifacts are tracked:")
for (const file of bad) console.error(`  ${file}`)
console.error("")
console.error("These files are created by runtime dependency installs in .koda/ and .koda/.")
console.error("Remove them from git and keep them ignored.")
process.exit(1)
