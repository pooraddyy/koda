import { run as runTui, type TuiInput } from "@koda-ai/tui"
import { Global } from "@koda-ai/core/global"
import { AppNodeBuilder } from "@koda-ai/core/effect/app-node-builder"
import { Effect } from "effect"

export function run(input: TuiInput) {
  return runTui(input).pipe(Effect.provide(AppNodeBuilder.build(Global.node)))
}
