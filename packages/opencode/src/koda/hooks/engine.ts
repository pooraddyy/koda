import {
  HOOK_EVENTS,
  type HookDefinition,
  type HookEvent,
  type HookOutcome,
  type HookPayload,
  type HookRunResult,
} from "./types"

const DEFAULT_TIMEOUT = 8_000
const DEFAULT_OUTPUT = 64 * 1024
const MAX_TIMEOUT = 60_000
const MAX_OUTPUT = 512 * 1024

export type HookExecutorInput = {
  readonly hook: HookDefinition
  readonly payload: HookPayload
  readonly command: readonly string[]
  readonly stdin: string
  readonly env: Readonly<Record<string, string>>
  readonly cwd: string
  readonly timeoutMs: number
  readonly maxOutputBytes: number
  readonly signal: AbortSignal
}

export type HookExecutorResult = {
  readonly exitCode: number
  readonly stdout: string
  readonly stderr: string
}

export type HookExecutor = (input: HookExecutorInput) => Promise<HookExecutorResult>

function eventsOf(hook: HookDefinition): readonly HookEvent[] {
  return Array.isArray(hook.event) ? hook.event : [hook.event]
}

function globMatch(pattern: string | undefined, value: string) {
  if (!pattern || pattern === "*") return true
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replaceAll("*", ".*")
    .replaceAll("?", ".")
  return new RegExp(`^${escaped}$`, "i").test(value)
}

function bounded(value: number | undefined, fallback: number, maximum: number) {
  if (!Number.isFinite(value)) return fallback
  return Math.max(100, Math.min(maximum, Math.floor(value as number)))
}

function scrubEnvironment(allowed: readonly string[] | undefined) {
  const names = new Set(allowed ?? [])
  const safe: Record<string, string> = {}
  for (const [key, value] of Object.entries(process.env)) {
    if (!value) continue
    if (names.has(key) || key === "PATH" || key === "HOME" || key === "PWD" || key === "SHELL" || key === "LANG") {
      safe[key] = value
    }
  }
  return safe
}

async function readLimited(stream: ReadableStream<Uint8Array> | null, maxBytes: number) {
  if (!stream) return ""
  const reader = stream.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  while (true) {
    const next = await reader.read()
    if (next.done) break
    const remaining = maxBytes - total
    if (remaining <= 0) break
    const chunk = next.value.byteLength > remaining ? next.value.slice(0, remaining) : next.value
    chunks.push(chunk)
    total += chunk.byteLength
    if (total >= maxBytes) break
  }
  return new TextDecoder().decode(Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))))
}

export async function spawnHookProcess(
  input: HookExecutorInput,
  command = input.command,
  options?: { readonly cwd?: string; readonly env?: Readonly<Record<string, string>> },
): Promise<HookExecutorResult> {
  const child = Bun.spawn(command, {
    stdin: new Blob([input.stdin]),
    stdout: "pipe",
    stderr: "pipe",
    cwd: options?.cwd ?? input.cwd,
    env: options?.env ?? input.env,
  })
  const abort = () => child.kill()
  input.signal.addEventListener("abort", abort, { once: true })
  try {
    const exitCode = await child.exited
    const [stdout, stderr] = await Promise.all([
      readLimited(child.stdout, input.maxOutputBytes),
      readLimited(child.stderr, input.maxOutputBytes),
    ])
    return { exitCode, stdout, stderr }
  } finally {
    input.signal.removeEventListener("abort", abort)
  }
}

function matches(hook: HookDefinition, payload: HookPayload) {
  return (
    hook.enabled !== false &&
    eventsOf(hook).includes(payload.event) &&
    globMatch(hook.matcher, payload.tool ?? payload.event)
  )
}

function safeDefinition(hook: HookDefinition) {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/.test(hook.id)) return "invalid hook id"
  if (!hook.command.trim()) return "command is empty"
  if (!HOOK_EVENTS.includes(eventsOf(hook)[0])) return "unknown hook event"
  if (eventsOf(hook).some((event) => !HOOK_EVENTS.includes(event))) return "unknown hook event"
  if (hook.onError === "block" && hook.trusted !== true) return "untrusted hooks cannot use block policy"
  return undefined
}

export class HookEngine {
  readonly #hooks: readonly HookDefinition[]
  readonly #executor: HookExecutor

  constructor(hooks: readonly HookDefinition[], executor: HookExecutor = spawnHookProcess) {
    const seen = new Set<string>()
    for (const hook of hooks) {
      if (seen.has(hook.id)) throw new Error(`Duplicate lifecycle hook: ${hook.id}`)
      seen.add(hook.id)
      const error = safeDefinition(hook)
      if (error) throw new Error(`Invalid lifecycle hook ${hook.id}: ${error}`)
    }
    this.#hooks = [...hooks]
    this.#executor = executor
  }

  list() {
    return this.#hooks.map((hook) => ({
      id: hook.id,
      event: hook.event,
      matcher: hook.matcher,
      mode: hook.mode ?? "async",
      onError: hook.onError ?? "warn",
      trusted: hook.trusted === true,
      enabled: hook.enabled !== false,
    }))
  }

  async run(payload: HookPayload): Promise<HookRunResult> {
    const matching = this.#hooks.filter((hook) => matches(hook, payload))
    const sync = matching.filter((hook) => (hook.mode ?? "async") === "sync")
    const asyncHooks = matching.filter((hook) => (hook.mode ?? "async") === "async")
    const outcomes: HookOutcome[] = []
    let allowed = true

    for (const hook of sync) {
      const outcome = await this.#runOne(hook, payload)
      outcomes.push(outcome)
      if (
        outcome.status === "blocked" ||
        (outcome.status !== "completed" && hook.onError === "block" && hook.trusted === true)
      ) {
        allowed = false
        break
      }
    }

    if (allowed && asyncHooks.length > 0) {
      const completed = await Promise.all(asyncHooks.map((hook) => this.#runOne(hook, payload)))
      outcomes.push(...completed)
    }

    return { allowed, outcomes }
  }

  async #runOne(hook: HookDefinition, payload: HookPayload): Promise<HookOutcome> {
    const started = Date.now()
    const timeoutMs = bounded(hook.timeoutMs, DEFAULT_TIMEOUT, MAX_TIMEOUT)
    const maxOutputBytes = bounded(hook.maxOutputBytes, DEFAULT_OUTPUT, MAX_OUTPUT)
    const command =
      process.platform === "win32"
        ? ["powershell.exe", "-NoProfile", "-NonInteractive", "-Command", hook.command]
        : ["/bin/sh", "-lc", hook.command]
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined
    let timedOut = false
    try {
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          timedOut = true
          controller.abort()
          reject(new Error(`hook timed out after ${timeoutMs}ms`))
        }, timeoutMs)
      })
      const result = await Promise.race([
        this.#executor({
          hook,
          payload,
          command,
          stdin: JSON.stringify(payload),
          env: scrubEnvironment(hook.environment),
          cwd: process.cwd(),
          timeoutMs,
          maxOutputBytes,
          signal: controller.signal,
        }),
        timeout,
      ])
      const output = [result.stdout, result.stderr].filter(Boolean).join("\n").trim()
      if (result.exitCode !== 0) {
        return {
          hookID: hook.id,
          event: payload.event,
          status: "failed",
          durationMs: Date.now() - started,
          ...(output ? { output } : {}),
          error: `hook exited with status ${result.exitCode}`,
          ...(hook.onError === "block" && hook.trusted === true ? { decision: "block" as const } : {}),
        }
      }
      return {
        hookID: hook.id,
        event: payload.event,
        status: "completed",
        durationMs: Date.now() - started,
        ...(output ? { output } : {}),
        decision: "allow",
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const blocking = hook.onError === "block" && hook.trusted === true
      return {
        hookID: hook.id,
        event: payload.event,
        status: timedOut ? "timed_out" : blocking ? "blocked" : "failed",
        durationMs: Date.now() - started,
        error: message,
        ...(blocking ? { decision: "block" as const } : {}),
      }
    } finally {
      if (timer) clearTimeout(timer)
    }
  }
}
