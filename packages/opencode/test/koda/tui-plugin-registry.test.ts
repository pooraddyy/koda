import { expect, test } from "bun:test"
import { internalTuiPlugins } from "@/plugin/tui/internal"

const koda = [
  "internal:home-news",
  "internal:home-onboarding",
  "internal:koda-attention",
  "internal:koda-home-footer",
  "internal:koda-permissions",
  "internal:koda-sidebar-footer",
  "internal:koda-sidebar-memory",
  "internal:koda-memory-palette",
  "internal:koda-sidebar-background-processes",
  "internal:koda-sidebar-indexing",
  "internal:koda-sidebar-pr",
  "internal:koda-sidebar-usage",
  "internal:sandbox",
  "internal:remote",
  "internal:reload",
]

test("internal TUI registry preserves every koda plugin before upstream builtins", () => {
  const ids = internalTuiPlugins({ experimentalEventSystem: false, experimentalSessionSwitcher: false }).map(
    (plugin) => plugin.id,
  )

  expect(ids.slice(0, koda.length)).toEqual(koda)
  expect(new Set(ids).size).toBe(ids.length)
  expect(ids).toContain("internal:sidebar-context")
  expect(ids).toContain("diff-viewer")
})

test("experimental koda TUI plugins remain wired", () => {
  const ids = internalTuiPlugins({ experimentalEventSystem: true, experimentalSessionSwitcher: true }).map(
    (plugin) => plugin.id,
  )

  expect(ids).toContain("internal:session-v2-debug")
  expect(ids).toContain("internal:session-switcher")
})
