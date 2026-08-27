import { describe, expect, test } from "bun:test"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { ConfigAgent } from "@/config/agent"
import { kodaConfig } from "@/koda/config/config"

describe("external agent Markdown discovery", () => {
  test.each([".pi", ".agents"])(
    "loads agents from %s/agents without enabling general config loading",
    async (rootName) => {
      const project = await fs.mkdtemp(path.join(os.tmpdir(), "koda-external-agent-"))
      const root = path.join(project, rootName)
      const agents = path.join(root, "agents")
      await fs.mkdir(agents, { recursive: true })
      await fs.writeFile(
        path.join(agents, "nested-review.md"),
        [
          "---",
          "display_name: Nested Review",
          "description: Check a focused change",
          "mode: subagent",
          "max_turns: 9",
          "tools: read, grep",
          "---",
          "Inspect the requested change and return evidence.",
        ].join("\n"),
      )

      try {
        const warnings: Array<{ path: string; message: string }> = []
        const loaded = await ConfigAgent.load(
          root,
          warnings,
          false,
          { root: project, source: root },
          { root: project, source: root },
        )
        expect(warnings).toEqual([])
        expect(loaded["nested-review"]).toMatchObject({
          displayName: "Nested Review",
          description: "Check a focused change",
          mode: "subagent",
          steps: 9,
          prompt: "Inspect the requested change and return evidence.",
        })
        expect(loaded["nested-review"].permission).toMatchObject({ read: "allow", grep: "allow" })
      } finally {
        await fs.rm(project, { recursive: true, force: true })
      }
    },
  )

  test("classifies compatibility roots as agent-only", () => {
    expect(kodaConfig.isAgentCompatibilityDir("/tmp/work/.pi")).toBe(true)
    expect(kodaConfig.isAgentCompatibilityDir("/tmp/work/.agents")).toBe(true)
    expect(kodaConfig.isAgentCompatibilityDir("/tmp/work/.koda")).toBe(false)
  })
})
