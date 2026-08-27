export * as ConfigPaths from "./paths"

import path from "path"
import { Flag } from "@opencode-ai/core/flag/flag"
import { Global } from "@opencode-ai/core/global"
import { unique } from "remeda"
import * as Effect from "effect/Effect"
import { FSUtil } from "@opencode-ai/core/fs-util"

export const files = Effect.fn("ConfigPaths.projectFiles")(function* (
  name: string,
  directory: string,
  worktree?: string,
) {
  const afs = yield* FSUtil.Service
  return (yield* afs.up({
    targets: [`${name}.jsonc`, `${name}.json`],
    start: directory,
    stop: worktree,
  })).toReversed()
})

export const directories = Effect.fn("ConfigPaths.directories")(function* (directory: string, worktree?: string) {
  const afs = yield* FSUtil.Service
  const nativeRoots = [".kilocode", ".kilo", ".koda"]
  const compatibilityRoots = [".pi", ".agents"]
  return unique([
    Global.Path.config,
    ...(!Flag.koda_DISABLE_PROJECT_CONFIG
      ? yield* afs.up({
          targets: [...compatibilityRoots],
          start: directory,
          stop: worktree,
        })
      : []),
    ...(!Flag.koda_DISABLE_PROJECT_CONFIG
      ? yield* afs.up({
          targets: nativeRoots,
          start: directory,
          stop: worktree,
        })
      : []),
    ...(yield* afs.up({
      targets: [...compatibilityRoots],
      start: Global.Path.home,
      stop: Global.Path.home,
    })),
    ...(yield* afs.up({
      targets: nativeRoots, // koda_change
      start: Global.Path.home,
      stop: Global.Path.home,
    })),
    ...(Flag.koda_CONFIG_DIR ? [Flag.koda_CONFIG_DIR] : []),
  ])
})

export function fileInDirectory(dir: string, name: string) {
  return [path.join(dir, `${name}.json`), path.join(dir, `${name}.jsonc`)]
}
