import type { TuiPlugin } from "@koda/plugin/tui"
import type { InternalTuiPlugin } from "@/plugin/tui/internal"
import { MemorySidebar } from "@/koda/cli/cmd/tui/component/memory-status"

const id = "internal:koda-sidebar-memory"

const tui: TuiPlugin = async (api) => {
  api.slots.register({
    order: 1000,
    slots: {
      sidebar_content(_ctx, props) {
        return <MemorySidebar api={api} sessionID={props.session_id} />
      },
    },
  })
}

const plugin: InternalTuiPlugin = {
  id,
  tui,
}

export default plugin
