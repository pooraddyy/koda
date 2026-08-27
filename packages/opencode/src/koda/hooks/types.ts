export const HOOK_EVENTS = [
  "session.start",
  "session.end",
  "turn.start",
  "turn.complete",
  "turn.error",
  "turn.interrupted",
  "prompt.submit",
  "tool.before",
  "tool.after",
  "subagent.start",
  "subagent.complete",
  "subagent.error",
  "graph.node",
  "graph.complete",
] as const

export type HookEvent = (typeof HOOK_EVENTS)[number]
export type HookMode = "sync" | "async"
export type HookFailurePolicy = "ignore" | "warn" | "block"

export type HookDefinition = {
  readonly id: string
  readonly event: HookEvent | readonly HookEvent[]
  readonly matcher?: string
  readonly command: string
  readonly mode?: HookMode
  readonly onError?: HookFailurePolicy
  readonly timeoutMs?: number
  readonly maxOutputBytes?: number
  readonly enabled?: boolean
  readonly trusted?: boolean
  readonly environment?: readonly string[]
}

export type HookPayload = {
  readonly event: HookEvent
  readonly timestamp: number
  readonly sessionID?: string
  readonly parentSessionID?: string
  readonly graphID?: string
  readonly nodeID?: string
  readonly tool?: string
  readonly data: Record<string, unknown>
}

export type HookOutcome = {
  readonly hookID: string
  readonly event: HookEvent
  readonly status: "skipped" | "completed" | "failed" | "blocked" | "timed_out"
  readonly durationMs: number
  readonly output?: string
  readonly error?: string
  readonly decision?: "allow" | "block"
}

export type HookRunResult = {
  readonly allowed: boolean
  readonly outcomes: readonly HookOutcome[]
}
