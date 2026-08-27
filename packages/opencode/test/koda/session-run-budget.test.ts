import { describe, expect, test } from "bun:test"
import { Schema } from "effect"
import { ConfigBudget } from "@opencode-ai/core/config/budget"
import { ConfigAgentV1 } from "@opencode-ai/core/v1/config/agent"
import * as RunBudget from "../../src/koda/session/run-budget"
import { SessionV1 } from "@opencode-ai/core/v1/session"

function assistant(id: string, input = 0, output = 0, cost = 0, tasks = 0): SessionV1.WithParts {
  return {
    info: {
      id,
      role: "assistant",
      sessionID: "ses_budget",
      parentID: "msg_parent",
      mode: "code",
      agent: "build",
      cost,
      tokens: { input, output, reasoning: 0, cache: { read: 0, write: 0 } },
      time: { created: 1 },
    },
    parts: Array.from({ length: tasks }, (_, index) => ({
      id: `part_${id}_${index}`,
      sessionID: "ses_budget",
      messageID: id,
      type: "tool",
      callID: `call_${id}_${index}`,
      tool: "task",
      state: { status: "completed", input: {}, output: "done", title: "task", metadata: {} },
    })),
  } as unknown as SessionV1.WithParts
}

describe("session run budget", () => {
  test("accepts bounded token, cost, and task limits", () => {
    expect(Schema.decodeUnknownSync(ConfigBudget.Info)({ tokens: 1000, cost: 2.5, tasks: 4 })).toEqual({
      tokens: 1000,
      cost: 2.5,
      tasks: 4,
    })
    expect(() => Schema.decodeUnknownSync(ConfigBudget.Info)({ tokens: 10_000_001 })).toThrow()
    expect(() => Schema.decodeUnknownSync(ConfigBudget.Info)({ cost: -1 })).toThrow()
    expect(() => Schema.decodeUnknownSync(ConfigBudget.Info)({ tasks: 100_001 })).toThrow()
  })

  test("accepts budgets in agent frontmatter and keeps them through normalization", () => {
    const agent = Schema.decodeUnknownSync(ConfigAgentV1.Info)({
      name: "bounded",
      prompt: "work safely",
      budget: { tokens: 5000, cost: 1.5, tasks: 3 },
    })
    expect(agent.budget).toEqual({ tokens: 5000, cost: 1.5, tasks: 3 })
  })

  test("does not charge historical messages after seeding", () => {
    const state = RunBudget.make({ tokens: 10, cost: 1, tasks: 2 })
    RunBudget.seed(state, [assistant("old", 100, 100, 10, 2)])
    expect(RunBudget.observeMany(state, [assistant("old", 100, 100, 10, 2)]).usage).toEqual({
      tokens: 0,
      cost: 0,
      tasks: 0,
    })
  })

  test("stops deterministically at the first configured budget", () => {
    const state = RunBudget.make({ tokens: 10, cost: 5, tasks: 2 })
    const result = RunBudget.observe(state, assistant("new", 8, 3, 1, 1))
    expect(result.exceeded).toEqual({ kind: "tokens", used: 11, limit: 10 })
    expect(RunBudget.describe(result.exceeded!)).toContain("token budget reached")
  })

  test("counts delegated task calls but not ordinary assistant text", () => {
    const state = RunBudget.make({ tasks: 2 })
    expect(RunBudget.observe(state, assistant("text")).usage.tasks).toBe(0)
    const result = RunBudget.observe(state, assistant("tasks", 0, 0, 0, 2))
    expect(result.usage.tasks).toBe(2)
    expect(result.exceeded?.kind).toBe("tasks")
  })

  test("treats a zero budget as an immediate bounded stop", () => {
    const state = RunBudget.make({ tokens: 0 })
    expect(RunBudget.observeMany(state, []).exceeded).toEqual({ kind: "tokens", used: 0, limit: 0 })
  })

  test("accepts active assistant usage before persisted tool parts are available", () => {
    const state = RunBudget.make({ tokens: 10, cost: 2 })
    const current = assistant("active", 4, 3, 1).info
    expect(RunBudget.observe(state, current).usage).toEqual({ tokens: 7, cost: 1, tasks: 0 })
  })
})
