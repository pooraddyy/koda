export const opaque = [
  { id: "semantic_search", file: "koda/tool/semantic-search.ts" },
  { id: "lsp", file: "tool/lsp.ts" },
] as const

export const host = [
  { id: "interactive_terminal", file: "koda/tool/interactive-terminal.ts" },
  { id: "background_process", file: "koda/tool/background-process.ts" },
] as const
