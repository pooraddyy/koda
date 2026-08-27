import { describe, expect, test } from "bun:test"
import { assertMutablePath } from "@/koda/agent-manager/protection"

describe("Agent Manager state protection", () => {
  test("rejects direct edits to Agent Manager state", () => {
    expect(() => assertMutablePath("/workspace/.koda/agent-manager.json")).toThrow(
      "Do not edit Agent Manager state directly",
    )
    expect(() => assertMutablePath("/workspace/.koda/agent-manager.json")).toThrow(
      "Do not edit Agent Manager state directly",
    )
  })

  test("allows ordinary project files", () => {
    expect(() => assertMutablePath("/workspace/.koda/settings.json")).not.toThrow()
    expect(() => assertMutablePath("/workspace/src/agent-manager.json")).not.toThrow()
  })
})
