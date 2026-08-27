import { afterEach, describe, expect, test } from "bun:test"
import fs from "fs/promises"
import os from "os"
import path from "path"
import { EvolutionStore } from "../../src/koda/evolution/store"

const roots: string[] = []

async function root() {
  const value = await fs.mkdtemp(path.join(os.tmpdir(), "koda-evolution-test-"))
  roots.push(value)
  return value
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((value) => fs.rm(value, { recursive: true, force: true })))
})

describe("EvolutionStore", () => {
  test("deduplicates lessons, redacts secrets, and searches by terms", async () => {
    const directory = await root()
    const first = await EvolutionStore.learn({
      root: directory,
      scope: "packages/opencode",
      lesson: "Run the focused test suite before the full suite.",
      evidence: "api_key=sk-test-123456789012345678901234",
      confidence: 0.6,
      sourceSessionID: "session-1",
    })
    const second = await EvolutionStore.learn({
      root: directory,
      scope: "packages/opencode",
      lesson: "Run the focused test suite before the full suite.",
      evidence: "The focused suite caught the regression.",
      confidence: 0.9,
      sourceSessionID: "session-2",
    })

    expect(first.created).toBe(true)
    expect(second.created).toBe(false)
    expect(second.total).toBe(1)
    expect(second.lesson.confidence).toBe(0.9)
    expect(second.lesson.uses).toBe(2)
    expect(second.lesson.evidence).not.toContain("sk-test")
    expect(await EvolutionStore.search(directory, "focused regression")).toHaveLength(1)
  })

  test("keeps the lesson catalog bounded and renders bounded prompt context", async () => {
    const directory = await root()
    for (let i = 0; i < 48; i++) {
      await EvolutionStore.learn({
        root: directory,
        scope: "project",
        lesson: `Verified lesson ${i} about a stable repository workflow.`,
        evidence: "A passing test confirmed the behavior.",
      })
    }

    const lessons = await EvolutionStore.list(directory)
    expect(lessons).toHaveLength(32)
    expect(EvolutionStore.prompt(lessons).join("\n").length).toBeLessThan(4_200)
    expect(EvolutionStore.location(directory)).toContain(path.join("evolution", "lessons.json"))
  })
})
