const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

function stableSerialize(value: unknown, seen: Set<object>): string {
  if (value === null) return "null"
  if (typeof value === "string") return JSON.stringify(value)
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : JSON.stringify(String(value))
  if (typeof value === "boolean") return value ? "true" : "false"
  if (typeof value === "bigint") return JSON.stringify(`${value}n`)
  if (typeof value === "undefined") return "undefined"
  if (typeof value === "function" || typeof value === "symbol") return JSON.stringify(String(value))
  if (seen.has(value as object)) return '"[Circular]"'
  seen.add(value as object)

  if (Array.isArray(value)) {
    const result = `[${value.map((item) => stableSerialize(item, seen)).join(",")}]`
    seen.delete(value)
    return result
  }

  if (isPlainObject(value)) {
    const result = `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableSerialize(value[key], seen)}`)
      .join(",")}}`
    seen.delete(value)
    return result
  }

  const result = JSON.stringify(String(value))
  seen.delete(value as object)
  return result
}

export function toolCallFingerprint(name: string, input: unknown): string {
  return stableSerialize({ input, name }, new Set())
}

export type RepeatedToolCallDecision = {
  readonly fingerprint: string
  readonly consecutiveCount: number
  readonly allowed: boolean
}

/**
 * Detects a provider repeatedly requesting the exact same local tool call.
 *
 * The guard is intentionally consecutive and bounded: a different tool or input
 * resets the counter, so legitimate repeated reads/writes separated by useful
 * work are not blocked. The caller decides how to surface a blocked call.
 */
export function createRepeatedToolCallGuard(maxConsecutive = 3) {
  if (!Number.isInteger(maxConsecutive) || maxConsecutive < 1 || maxConsecutive > 32) {
    throw new Error("maxConsecutive must be an integer between 1 and 32")
  }

  let previousFingerprint: string | undefined
  let consecutiveCount = 0

  return {
    observe(name: string, input: unknown): RepeatedToolCallDecision {
      const fingerprint = toolCallFingerprint(name, input)
      if (fingerprint === previousFingerprint) consecutiveCount += 1
      else {
        previousFingerprint = fingerprint
        consecutiveCount = 1
      }
      return {
        fingerprint,
        consecutiveCount,
        allowed: consecutiveCount <= maxConsecutive,
      }
    },
    reset() {
      previousFingerprint = undefined
      consecutiveCount = 0
    },
  }
}
