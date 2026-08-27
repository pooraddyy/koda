import type { TuiPlugin } from "@koda/plugin/tui"
import type { InternalTuiPlugin } from "@/plugin/tui/internal"
import { DialogMemoryHelp } from "@/koda/cli/cmd/tui/component/dialog-memory"

const id = "internal:koda-memory-palette"

const tui: TuiPlugin = async (api) => {
  api.keymap.registerLayer({
    commands: [
      {
        namespace: "palette",
        name: "memory.help",
        title: "Memory",
        slashName: "memory",
        slashAliases: ["mem"],
        category: "System",
        run() {
          api.ui.dialog.setSize("large")
          api.ui.dialog.replace(() => <DialogMemoryHelp />)
        },
      },
    ],
    bindings: [],
  })
}

const plugin: InternalTuiPlugin = {
  id,
  tui,
}

export default plugin
