import { describe, expect, test } from "bun:test"
import { createRepeatedToolCallGuard, toolCallFingerprint } from "../src/session/runner/repeated-tool-call-guard"

describe("repeated tool call guard", () => {
  test("canonicalizes object key order", () => {
    expect(toolCallFingerprint("read", { path: "src/a.ts", line: 4 })).toBe(
      toolCallFingerprint("read", { line: 4, path: "src/a.ts" }),
    )
  })

  test("allows the configured number of consecutive calls and blocks the next", () => {
    const guard = createRepeatedToolCallGuard(3)

    expect(guard.observe("read", { path: "a.ts" })).toMatchObject({ consecutiveCount: 1, allowed: true })
    expect(guard.observe("read", { path: "a.ts" })).toMatchObject({ consecutiveCount: 2, allowed: true })
    expect(guard.observe("read", { path: "a.ts" })).toMatchObject({ consecutiveCount: 3, allowed: true })
    expect(guard.observe("read", { path: "a.ts" })).toMatchObject({ consecutiveCount: 4, allowed: false })
  })

  test("resets after a different tool or input", () => {
    const guard = createRepeatedToolCallGuard(2)
    guard.observe("read", { path: "a.ts" })
    guard.observe("read", { path: "a.ts" })

    expect(guard.observe("read", { path: "b.ts" })).toMatchObject({ consecutiveCount: 1, allowed: true })
    expect(guard.observe("grep", { pattern: "TODO" })).toMatchObject({ consecutiveCount: 1, allowed: true })
  })

  test("can be explicitly reset", () => {
    const guard = createRepeatedToolCallGuard(1)
    guard.observe("read", { path: "a.ts" })
    expect(guard.observe("read", { path: "a.ts" }).allowed).toBe(false)

    guard.reset()
    expect(guard.observe("read", { path: "a.ts" })).toMatchObject({ consecutiveCount: 1, allowed: true })
  })

  test("rejects unsafe limits", () => {
    expect(() => createRepeatedToolCallGuard(0)).toThrow()
    expect(() => createRepeatedToolCallGuard(33)).toThrow()
    expect(() => createRepeatedToolCallGuard(1.5)).toThrow()
  })
})
