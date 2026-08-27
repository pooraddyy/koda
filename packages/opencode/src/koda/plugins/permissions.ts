import type { TuiPlugin } from "@koda/plugin/tui"
import type { InternalTuiPlugin } from "@/plugin/tui/internal"
import { MemoryPermission } from "@/koda/cli/cmd/tui/permissions"

const id = "internal:koda-permissions"

const tui: TuiPlugin = async () => {
  MemoryPermission.register()
}

const plugin: InternalTuiPlugin = {
  id,
  tui,
}

export default plugin
