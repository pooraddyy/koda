import { providerIconNames } from "./icon-names"

export type ProviderMetadata = {
  noteKey?: string
  icon?: string
  priority?: number
}

const notes: Record<string, string> = {
  koda: "settings.providers.note.koda",
  opencode: "settings.providers.note.opencode",
  anthropic: "settings.providers.note.anthropic",
  deepseek: "settings.providers.note.deepseek",
  "github-copilot": "settings.providers.note.copilot",
  openai: "settings.providers.note.openai",
  google: "settings.providers.note.google",
  openrouter: "settings.providers.note.openrouter",
  vercel: "settings.providers.note.vercel",
  "anaconda-desktop": "settings.providers.note.anacondaDesktop",
}

const order = ["koda", "anthropic", "deepseek", "openai", "google", "anaconda-desktop", "openrouter", "vercel"] as const

const priority = new Map<string, number>(order.map((id, index) => [id, index]))

const icons = new Set<string>(providerIconNames)

function key(id: string) {
  if (id.startsWith("github-copilot")) return "github-copilot"
  return id
}

export function providerMetadata(id: string): ProviderMetadata {
  const name = key(id)
  const note = notes[name]
  return {
    noteKey: note,
    icon: icons.has(name) ? name : "synthetic",
    priority: priority.get(name),
  }
}
