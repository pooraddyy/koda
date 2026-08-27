import { describe, expect, test } from "bun:test"
import { allowsNestedAgent, normalizeExternalAgentFrontmatter } from "@/koda/agent/external-agent-compat"

describe("external agent frontmatter compatibility", () => {
  test("maps display name, turn limit, and disabled state", () => {
    const result = normalizeExternalAgentFrontmatter({
      name: "reviewer",
      display_name: "Review Assistant",
      max_turns: "7",
      enabled: false,
      run_in_background: true,
    })

    expect(result).toMatchObject({
      name: "reviewer",
      displayName: "Review Assistant",
      steps: 7,
      disable: true,
      options: { piCompat: { run_in_background: true } },
    })
    expect(result).not.toHaveProperty("display_name")
    expect(result).not.toHaveProperty("max_turns")
    expect(result).not.toHaveProperty("enabled")
  })

  test("converts list, CSV, and deny-prefix tool forms", () => {
    expect(
      normalizeExternalAgentFrontmatter({
        tools: ["read", "grep", "!bash"],
        disallowed_tools: "write, shell",
      }).tools,
    ).toEqual({ read: true, grep: true, bash: false, write: false })
  })

  test("supports explicit all and none tool policies", () => {
    expect(normalizeExternalAgentFrontmatter({ tools: "all" }).tools).toEqual({})
    expect(normalizeExternalAgentFrontmatter({ tools: "none" }).tools).toEqual({ "*": false })
  })

  test("lets Koda-native fields win over compatibility aliases", () => {
    const result = normalizeExternalAgentFrontmatter({
      displayName: "Koda Reviewer",
      display_name: "External Reviewer",
      steps: 3,
      max_turns: 10,
      disable: false,
      enabled: false,
      prompt_mode: "replace",
    })

    expect(result).toMatchObject({
      displayName: "Koda Reviewer",
      steps: 3,
      disable: false,
      options: { piCompat: { prompt_mode: "replace" } },
    })
  })

  test("enforces an imported nested-agent allowlist", () => {
    const normalized = normalizeExternalAgentFrontmatter({ allowed_subagents: ["Reviewer", "*ignored"] })
    expect(normalized.options).toEqual({ piCompat: { allowed_subagents: ["Reviewer", "*ignored"] } })
    expect(
      allowsNestedAgent({ options: { piCompat: { allowed_subagents: ["Reviewer", "*ignored"] } } }, "reviewer"),
    ).toBe(true)
    expect(
      allowsNestedAgent({ options: { piCompat: { allowed_subagents: ["Reviewer", "*ignored"] } } }, "tester"),
    ).toBe(false)
    expect(allowsNestedAgent({ options: { piCompat: { allowed_subagents: "*" } } }, "anything")).toBe(true)
    expect(allowsNestedAgent({ options: { piCompat: { allowed_subagents: [] } } }, "anything")).toBe(false)
  })

  test("keeps unsupported runner settings inspectable instead of executing them", () => {
    const result = normalizeExternalAgentFrontmatter({
      allowed_subagents: ["reviewer", "tester"],
      inherit_context: false,
      isolation: "worktree",
      memory: true,
      thinking: "high",
    })

    expect(result.options).toEqual({
      piCompat: {
        allowed_subagents: ["reviewer", "tester"],
        inherit_context: false,
        isolation: "worktree",
        memory: true,
        thinking: "high",
      },
    })
  })
})
