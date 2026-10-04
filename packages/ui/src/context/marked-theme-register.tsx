import { registerCustomTheme } from "@pierre/diffs"
import { KodaTheme } from "./marked-theme"

let registered = false

export function registerKodaTheme() {
  if (registered) return
  registered = true
  registerCustomTheme("Koda", () => Promise.resolve(KodaTheme))
}
