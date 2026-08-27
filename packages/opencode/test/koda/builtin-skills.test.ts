import { AppNodeBuilder } from "@opencode-ai/core/effect/app-node-builder"
import { expect } from "bun:test"
import { Effect, Layer } from "effect"
import { CrossSpawnSpawner } from "@opencode-ai/core/cross-spawn-spawner"
import path from "path"
import { Skill } from "../../src/skill"
import * as kodaSkill from "../../src/koda/skill-remove"
import { BUILTIN_SKILLS } from "../../src/koda/skills/builtin"
import { TestInstance } from "../fixture/fixture"
import { testEffect } from "../lib/effect"

const it = testEffect(Layer.mergeAll(AppNodeBuilder.build(Skill.node), AppNodeBuilder.build(CrossSpawnSpawner.node)))

it.instance(
  "built-in skills are present in empty project",
  () =>
    Effect.gen(function* () {
      const skill = yield* Skill.Service
      const skills = yield* skill.all()
      for (const builtin of BUILTIN_SKILLS) {
        const found = skills.find((s) => s.name === builtin.name)
        expect(found).toBeDefined()
        expect(found!.location).toBe(Skill.BUILTIN_LOCATION)
        expect(found!.description).toBe(builtin.description)
        expect(found!.content.length).toBeGreaterThan(0)
      }
    }),
  { git: true },
)

it.instance(
  "built-in skill has correct metadata",
  () =>
    Effect.gen(function* () {
      const skill = yield* Skill.Service
      const item = yield* skill.get("koda-config")
      expect(item).toBeDefined()
      expect(item!.name).toBe("koda-config")
      expect(item!.location).toBe(Skill.BUILTIN_LOCATION)
      expect(item!.content).toContain("koda")
    }),
  { git: true },
)

it.instance(
  "koda-config is protected from removal",
  () =>
    Effect.gen(function* () {
      const skill = yield* Skill.Service
      const item = yield* skill.get("koda-config")
      expect(item).toBeDefined()
      expect(kodaSkill.builtin(item!.location)).toBe(true)
    }),
  { git: true },
)

it.instance(
  "user skill overrides built-in with same name",
  () =>
    Effect.gen(function* () {
      const instance = yield* TestInstance
      const dir = path.join(instance.directory, ".koda", "skill", "koda-config")
      yield* Effect.promise(() =>
        Bun.write(
          path.join(dir, "SKILL.md"),
          `---
name: koda-config
description: User override of koda-config.
---

# Custom koda-config

User-provided content.
`,
        ),
      )

      const skill = yield* Skill.Service
      const item = yield* skill.get("koda-config")
      expect(item).toBeDefined()
      expect(item!.description).toBe("User override of koda-config.")
      expect(item!.location).not.toBe(Skill.BUILTIN_LOCATION)
      expect(item!.location).toContain(path.join("skill", "koda-config", "SKILL.md"))
    }),
  { git: true },
)
