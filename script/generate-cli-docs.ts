#!/usr/bin/env bun

import { $ } from "bun"

await $`bun run --conditions=browser ./src/koda/generate-cli-docs.ts`.cwd("packages/opencode")
