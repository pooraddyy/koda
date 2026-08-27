// koda_change - new file
import { describe, expect, test } from "bun:test"
import { kodaRunAuto } from "../../src/koda/cli/run-auto"

describe("kodaRunAuto", () => {
  test("tracks task child sessions without allowing unrelated sessions", () => {
    const state = kodaRunAuto.create("ses_root")

    expect(kodaRunAuto.allowed(state, "ses_root")).toBe(true)
    expect(kodaRunAuto.allowed(state, "ses_child")).toBe(false)

    kodaRunAuto.track(state, {
      type: "tool",
      tool: "task",
      sessionID: "ses_root",
      state: {
        metadata: {
          sessionId: "ses_child",
        },
      },
    })

    expect(kodaRunAuto.allowed(state, "ses_child")).toBe(true)
    expect(kodaRunAuto.allowed(state, "ses_other")).toBe(false)
  })

  test("ignores malformed or non-root task metadata", () => {
    const state = kodaRunAuto.create("ses_root")

    kodaRunAuto.track(state, {
      type: "tool",
      tool: "task",
      sessionID: "ses_root",
      state: {
        metadata: {
          sessionId: "",
        },
      },
    })
    kodaRunAuto.track(state, {
      type: "tool",
      tool: "task",
      sessionID: "ses_other",
      state: {
        metadata: {
          sessionId: "ses_wrong",
        },
      },
    })
    kodaRunAuto.track(state, {
      type: "text",
      sessionID: "ses_root",
      state: {},
    })

    expect(kodaRunAuto.allowed(state, "ses_wrong")).toBe(false)
    expect(kodaRunAuto.allowed(state, "")).toBe(false)
  })
})
