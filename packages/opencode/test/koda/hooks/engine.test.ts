import { describe, expect, it } from "bun:test"
import { HookEngine } from "@/koda/hooks/engine"

const payload = {
  event: "tool.before" as const,
  timestamp: 1,
  sessionID: "session-1",
  tool: "shell",
  data: { command: "printf ok" },
}

describe("lifecycle hook engine", () => {
  it("matches tool patterns and executes a hook with JSON input", async () => {
    const engine = new HookEngine([
      { id: "shell-audit", event: "tool.before", matcher: "shell", command: "cat", mode: "sync", trusted: true },
      { id: "read-only", event: "tool.before", matcher: "read", command: "printf skip", mode: "sync", trusted: true },
    ])
    const result = await engine.run(payload)
    expect(result.allowed).toBe(true)
    expect(result.outcomes).toHaveLength(1)
    expect(result.outcomes[0]?.status).toBe("completed")
    expect(result.outcomes[0]?.output).toContain('"sessionID":"session-1"')
  })

  it("allows trusted synchronous hooks to block an operation", async () => {
    const engine = new HookEngine([
      {
        id: "deny-shell",
        event: "tool.before",
        matcher: "shell",
        command: "printf 'unsafe command' >&2; exit 7",
        mode: "sync",
        onError: "block",
        trusted: true,
      },
    ])
    const result = await engine.run(payload)
    expect(result.allowed).toBe(false)
    expect(result.outcomes[0]?.status).toBe("failed")
    expect(result.outcomes[0]?.decision).toBe("block")
  })

  it("rejects untrusted blocking definitions", () => {
    expect(
      () => new HookEngine([{ id: "unsafe", event: "tool.before", command: "exit 1", mode: "sync", onError: "block" }]),
    ).toThrow("untrusted")
  })

  it("bounds hook execution and captures timeouts", async () => {
    const engine = new HookEngine([
      { id: "slow", event: "tool.before", command: "sleep 1", mode: "sync", timeoutMs: 100, trusted: true },
    ])
    const result = await engine.run(payload)
    expect(result.allowed).toBe(true)
    expect(result.outcomes[0]?.status).toBe("timed_out")
  })

  it("lists trusted and mode metadata without exposing commands", () => {
    const engine = new HookEngine([
      { id: "audit", event: "session.start", command: "printf secret", mode: "async", trusted: true },
    ])
    expect(engine.list()).toEqual([
      { id: "audit", event: "session.start", mode: "async", onError: "warn", trusted: true, enabled: true },
    ])
    expect(JSON.stringify(engine.list())).not.toContain("printf secret")
  })
})
