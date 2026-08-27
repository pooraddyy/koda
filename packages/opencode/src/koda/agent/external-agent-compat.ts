import { isRecord } from "@/util/record"

/**
 * Compatibility metadata understood by Koda when importing agent Markdown written
 * for other subagent runners. This is deliberately a data adapter, not a runtime
 * copy of another runner's session implementation.
 */
export const PI_COMPAT_KEYS = [
  "run_in_background",
  "inherit_context",
  "allowed_subagents",
  "prompt_mode",
  "persist_session",
  "output_transcript",
  "session_dir",
  "isolation",
  "isolated",
  "memory",
  "skills",
  "extensions",
  "exclude_extensions",
  "disallowed_tools",
  "thinking",
] as const

function listOfStrings(value: unknown): string[] {
  if (Array.isArray(value))
    return value
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter(Boolean)
  if (typeof value !== "string") return []
  return value
    .split(/[\s,]+/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function canonicalToolName(name: string) {
  const lower = name.toLowerCase()
  if (lower === "apply_patch" || lower === "patch") return "edit"
  if (lower === "shell") return "bash"
  return lower
}

function toolRules(value: unknown): Record<string, boolean> | undefined {
  if (value === undefined || value === null) return undefined
  if (typeof value === "string" && value.trim().toLowerCase() === "all") return {}
  if (typeof value === "string" && value.trim().toLowerCase() === "none") return { "*": false }

  const rules: Record<string, boolean> = {}
  if (isRecord(value)) {
    for (const [name, enabled] of Object.entries(value)) {
      if (typeof enabled === "boolean") rules[canonicalToolName(name)] = enabled
    }
    return rules
  }

  for (const raw of listOfStrings(value)) {
    const denied = raw.startsWith("!") || raw.startsWith("-")
    const name = canonicalToolName(denied ? raw.slice(1) : raw)
    if (name) rules[name] = !denied
  }
  return rules
}

function positiveInteger(value: unknown) {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) return value
  if (typeof value === "string" && /^\d+$/.test(value.trim())) {
    const parsed = Number(value)
    if (Number.isSafeInteger(parsed) && parsed > 0) return parsed
  }
  return undefined
}

/**
 * Convert common external agent frontmatter into Koda's AgentConfig shape.
 * Unknown compatibility settings are nested under `options.piCompat` so the
 * source remains inspectable without being mistaken for provider parameters.
 */
export function normalizeExternalAgentFrontmatter(input: Record<string, unknown>): Record<string, unknown> {
  const output: Record<string, unknown> = { ...input }
  const options = isRecord(output.options) ? { ...output.options } : {}
  const existingCompat = isRecord(options.piCompat) ? { ...options.piCompat } : {}

  if (output.displayName === undefined && typeof output.display_name === "string") {
    output.displayName = output.display_name
  }
  delete output.display_name

  if (output.steps === undefined && output.maxSteps === undefined && output.max_turns !== undefined) {
    const steps = positiveInteger(output.max_turns)
    if (steps !== undefined) output.steps = steps
  }
  delete output.max_turns

  if (output.disable === undefined && output.enabled === false) output.disable = true
  delete output.enabled

  const toolSet = toolRules(output.tools)
  const denied = toolRules(output.disallowed_tools)
  if (toolSet !== undefined || denied !== undefined) {
    output.tools = {
      ...toolSet,
      ...(denied ? Object.fromEntries(Object.keys(denied).map((name) => [name, false])) : {}),
    }
  }

  for (const key of PI_COMPAT_KEYS) {
    if (output[key] !== undefined) {
      existingCompat[key] = output[key]
      delete output[key]
    }
  }

  if (Object.keys(existingCompat).length > 0) options.piCompat = existingCompat
  if (Object.keys(options).length > 0) output.options = options
  else delete output.options
  return output
}

/**
 * Enforce an imported agent's optional nested-delegation allowlist. A missing
 * field means no additional restriction, while an explicitly empty list denies
 * every nested target. Matching is case-insensitive and supports `*`.
 */
export function allowsNestedAgent(caller: { options?: Record<string, unknown> }, requested: string): boolean {
  const options = caller.options
  const compat = options && isRecord(options.piCompat) ? options.piCompat : undefined
  if (!compat || !Object.prototype.hasOwnProperty.call(compat, "allowed_subagents")) return true
  const allowed = listOfStrings(compat.allowed_subagents).map((name) => name.toLowerCase())
  const target = requested.trim().toLowerCase()
  return allowed.includes("*") || allowed.includes(target)
}
