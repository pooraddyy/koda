import { ConfigBudget } from "@opencode-ai/core/config/budget"
import { SessionV1 } from "@opencode-ai/core/v1/session"

export type Limits = ConfigBudget.Info

export type Usage = {
  readonly tokens: number
  readonly cost: number
  readonly tasks: number
}

export type State = {
  readonly limits: Limits | undefined
  usage: Usage
  readonly observedMessages: Set<string>
}

export type Exceeded = {
  readonly kind: "tokens" | "cost" | "tasks"
  readonly used: number
  readonly limit: number
}

export type Observation = {
  readonly usage: Usage
  readonly exceeded?: Exceeded
}

const EMPTY_USAGE: Usage = { tokens: 0, cost: 0, tasks: 0 }
const MAX_SAFE_VALUE = 1_000_000_000

function finiteNonNegative(value: number | undefined) {
  if (value === undefined || !Number.isFinite(value) || value <= 0) return 0
  return Math.min(value, MAX_SAFE_VALUE)
}

type ObservedMessage = SessionV1.WithParts | SessionV1.Assistant

function messageInfo(message: ObservedMessage) {
  return "info" in message ? message.info : message
}

function messageParts(message: ObservedMessage) {
  return "parts" in message ? message.parts : []
}

function messageTaskCount(message: ObservedMessage) {
  const info = messageInfo(message)
  if (info.role !== "assistant") return 0
  return messageParts(message).filter(
    (part) => part.type === "tool" && (part.tool === "task" || part.tool === "collaborate"),
  ).length
}

function firstExceeded(limits: Limits | undefined, usage: Usage): Exceeded | undefined {
  if (!limits) return undefined
  if (limits.tokens !== undefined && usage.tokens >= limits.tokens) {
    return { kind: "tokens", used: usage.tokens, limit: limits.tokens }
  }
  if (limits.cost !== undefined && usage.cost >= limits.cost) {
    return { kind: "cost", used: usage.cost, limit: limits.cost }
  }
  if (limits.tasks !== undefined && usage.tasks >= limits.tasks) {
    return { kind: "tasks", used: usage.tasks, limit: limits.tasks }
  }
  return undefined
}

export function make(limits: Limits | undefined): State {
  return { limits, usage: EMPTY_USAGE, observedMessages: new Set() }
}

export function seed(state: State, messages: readonly SessionV1.WithParts[]) {
  for (const message of messages) state.observedMessages.add(String(message.info.id))
}

export function observeMany(state: State, messages: readonly SessionV1.WithParts[]): Observation {
  let exceeded = firstExceeded(state.limits, state.usage)
  for (const message of messages) {
    if (exceeded) break
    exceeded = observe(state, message).exceeded
  }
  return { usage: state.usage, exceeded }
}

export function observe(state: State, message: ObservedMessage): Observation {
  const info = messageInfo(message)
  const messageID = String(info.id)
  if (state.observedMessages.has(messageID))
    return { usage: state.usage, exceeded: firstExceeded(state.limits, state.usage) }
  state.observedMessages.add(messageID)

  const tokens =
    info.role === "assistant"
      ? finiteNonNegative(
          info.tokens.input +
            info.tokens.output +
            info.tokens.reasoning +
            info.tokens.cache.read +
            info.tokens.cache.write,
        )
      : 0
  const cost = info.role === "assistant" ? finiteNonNegative(info.cost) : 0
  const tasks = messageTaskCount(message)
  state.usage = {
    tokens: Math.min(MAX_SAFE_VALUE, state.usage.tokens + tokens),
    cost: Math.min(MAX_SAFE_VALUE, state.usage.cost + cost),
    tasks: Math.min(MAX_SAFE_VALUE, state.usage.tasks + tasks),
  }
  return { usage: state.usage, exceeded: firstExceeded(state.limits, state.usage) }
}

export function describe(exceeded: Exceeded) {
  const label = exceeded.kind === "tokens" ? "token" : exceeded.kind === "cost" ? "cost" : "delegated task"
  const unit = exceeded.kind === "tokens" ? "tokens" : exceeded.kind === "cost" ? "USD" : "delegated tasks"
  return `Agent ${label} budget reached: ${exceeded.used} ${unit} used of ${exceeded.limit}`
}
