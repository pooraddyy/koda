import { createBuiltinPlugins, type BuiltinTuiPlugin } from "@opencode-ai/tui/builtins"
import type { RuntimeFlags } from "@/effect/runtime-flags"
import { withkodaTuiPlugins } from "@/koda/plugins/internal" // koda_change

export type InternalTuiPlugin = BuiltinTuiPlugin

// koda_change start
export function internalTuiPlugins(
  flags: Pick<RuntimeFlags.Info, "experimentalEventSystem" | "experimentalSessionSwitcher">,
): InternalTuiPlugin[] {
  return withkodaTuiPlugins(
    createBuiltinPlugins({
      experimentalEventSystem: flags.experimentalEventSystem,
    }),
    flags,
  )
  // koda_change end
}
