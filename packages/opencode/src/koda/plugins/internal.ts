import type { BuiltinTuiPlugin } from "@opencode-ai/tui/builtins"
import HomeNews from "@/koda/plugins/home-news"
import HomeOnboarding from "@/koda/plugins/home-onboarding"
import Attention from "@/koda/plugins/attention"
import HomeFooter from "@/koda/plugins/home-footer"
import Permissions from "@/koda/plugins/permissions"
import SidebarFooter from "@/koda/plugins/sidebar-footer"
import MemoryStatus from "@/koda/plugins/memory-status"
import MemoryPalette from "@/koda/plugins/memory-palette"
import SidebarProcesses from "@/koda/plugins/sidebar-background-processes"
import SidebarIndexing from "@/koda/plugins/sidebar-indexing"
import SidebarPr from "@/koda/plugins/sidebar-pr"
import SidebarUsage from "@/koda/plugins/sidebar-usage"
import Sandbox from "@/koda/plugins/sandbox"
import Remote from "@/koda/plugins/remote"
import Reload from "@/koda/plugins/reload"
import SessionSwitcher from "@/koda/plugins/session-switcher"
import SessionV2Debug from "@/koda/plugins/session-v2-debug"
import type { RuntimeFlags } from "@/effect/runtime-flags"

const plugins = [
  HomeNews,
  HomeOnboarding,
  Attention,
  HomeFooter,
  Permissions,
  SidebarFooter,
  MemoryStatus,
  MemoryPalette,
  SidebarProcesses,
  SidebarIndexing,
  SidebarPr,
  SidebarUsage,
  Sandbox,
  Remote,
  Reload,
] satisfies BuiltinTuiPlugin[]

export function withkodaTuiPlugins(
  builtins: BuiltinTuiPlugin[],
  flags: Pick<RuntimeFlags.Info, "experimentalEventSystem" | "experimentalSessionSwitcher">,
) {
  return [
    ...plugins,
    ...(flags.experimentalEventSystem ? [SessionV2Debug] : []),
    ...(flags.experimentalSessionSwitcher ? [SessionSwitcher] : []),
    ...builtins,
  ]
}
