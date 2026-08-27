import { describe, expect } from "bun:test"
import { ConfigProvider, Effect, Layer } from "effect"
import { AppNodeBuilder } from "@opencode-ai/core/effect/app-node-builder"
import { RuntimeFlags } from "../../src/effect/runtime-flags"
import { it } from "../lib/effect"

const fromConfig = (input: Record<string, unknown>) =>
  AppNodeBuilder.build(RuntimeFlags.node).pipe(Layer.provide(ConfigProvider.layer(ConfigProvider.fromUnknown(input))))

const readFlags = RuntimeFlags.Service.useSync((flags) => flags)

describe("RuntimeFlags", () => {
  it.effect("layer defaults autoShare to false", () =>
    Effect.gen(function* () {
      const flags = yield* readFlags.pipe(Effect.provide(fromConfig({})))

      expect(flags.autoShare).toBe(false)
      expect(flags.experimentalBackgroundSubagents).toBe(true) // koda_change
    }),
  )

  // koda_change start - preserve the background-subagent kill switch
  it.effect("allows disabling background subagents explicitly", () =>
    Effect.gen(function* () {
      const flags = yield* readFlags.pipe(
        Effect.provide(fromConfig({ koda_EXPERIMENTAL_BACKGROUND_SUBAGENTS: "false" })),
      )

      expect(flags.experimentalBackgroundSubagents).toBe(false)
    }),
  )
  // koda_change end

  it.effect("layer parses plugin flags from the active ConfigProvider", () =>
    Effect.gen(function* () {
      const flags = yield* readFlags.pipe(
        Effect.provide(
          fromConfig({
            koda_PURE: "true",
            koda_DISABLE_DEFAULT_PLUGINS: "true",
            koda_AUTO_SHARE: "true",
            koda_DISABLE_EMBEDDED_WEB_UI: "true",
            koda_DISABLE_EXTERNAL_SKILLS: "true",
            koda_DISABLE_LSP_DOWNLOAD: "true",
            koda_EXPERIMENTAL: "true",
            koda_ENABLE_EXA: "true",
            koda_ENABLE_PARALLEL: "true",
            koda_ENABLE_EXPERIMENTAL_MODELS: "true",
            koda_ENABLE_QUESTION_TOOL: "true",
            koda_CLIENT: "desktop",
          }),
        ),
      )

      expect(flags.pure).toBe(true)
      expect(flags.autoShare).toBe(true)
      expect(flags.disableDefaultPlugins).toBe(true)
      expect(flags.disableEmbeddedWebUi).toBe(true)
      expect(flags.disableExternalSkills).toBe(true)
      expect(flags.disableLspDownload).toBe(true)
      expect(flags.disableClaudeCodePrompt).toBe(false)
      expect(flags.enableExa).toBe(true)
      expect(flags.enableParallel).toBe(true)
      expect(flags.enableExperimentalModels).toBe(true)
      expect(flags.enableQuestionTool).toBe(true)
      expect(flags.experimentalReferences).toBe(true)
      expect(flags.experimentalLspTy).toBe(false)
      expect(flags.experimentalLspTool).toBe(true)
      expect(flags.experimentalOxfmt).toBe(true)
      expect(flags.experimentalPlanMode).toBe(true)
      expect(flags.experimentalEventSystem).toBe(true)
      expect(flags.experimentalWorkspaces).toBe(true)
      expect(flags.experimentalIconDiscovery).toBe(true)
      expect(flags.experimentalNativeLlm).toBe(false)
      expect(flags.experimentalWebSockets).toBe(false)
      expect(flags.client).toBe("desktop")
    }),
  )

  it.effect("layer parses koda_EXPERIMENTAL_LSP_TY", () =>
    Effect.gen(function* () {
      const flags = yield* readFlags.pipe(
        Effect.provide(
          fromConfig({
            koda_EXPERIMENTAL_LSP_TY: "true",
          }),
        ),
      )

      expect(flags.experimentalLspTy).toBe(true)
    }),
  )

  it.effect("enables native LLM via dedicated flag only", () =>
    Effect.gen(function* () {
      const explicit = yield* readFlags.pipe(Effect.provide(fromConfig({ koda_EXPERIMENTAL_NATIVE_LLM: "true" })))
      const umbrella = yield* readFlags.pipe(Effect.provide(fromConfig({ koda_EXPERIMENTAL: "true" })))

      expect(explicit.experimentalNativeLlm).toBe(true)
      expect(umbrella.experimentalNativeLlm).toBe(false)
    }),
  )

  it.effect("enables WebSockets via dedicated flag only", () =>
    Effect.gen(function* () {
      const explicit = yield* readFlags.pipe(Effect.provide(fromConfig({ koda_EXPERIMENTAL_WEBSOCKETS: "true" })))
      const umbrella = yield* readFlags.pipe(Effect.provide(fromConfig({ koda_EXPERIMENTAL: "true" })))

      expect(explicit.experimentalWebSockets).toBe(true)
      expect(umbrella.experimentalWebSockets).toBe(false)
    }),
  )

  it.effect("layer accepts partial test overrides and fills defaults from Config definitions", () =>
    Effect.gen(function* () {
      const flags = yield* readFlags.pipe(
        Effect.provide(RuntimeFlags.layer({ disableDefaultPlugins: true, bashDefaultTimeoutMs: 1_000 })),
      )

      expect(flags.pure).toBe(false)
      expect(flags.autoShare).toBe(false)
      expect(flags.disableDefaultPlugins).toBe(true)
      expect(flags.disableEmbeddedWebUi).toBe(false)
      expect(flags.disableExternalSkills).toBe(false)
      expect(flags.disableLspDownload).toBe(false)
      expect(flags.disableClaudeCodePrompt).toBe(false)
      expect(flags.disableClaudeCodeSkills).toBe(false)
      expect(flags.enableExa).toBe(false)
      expect(flags.experimentalIconDiscovery).toBe(false)
      expect(flags.experimentalOxfmt).toBe(false)
      expect(flags.outputTokenMax).toBeUndefined()
      expect(flags.bashDefaultTimeoutMs).toBe(1_000)
      expect(flags.enableExperimentalModels).toBe(false)
      expect(flags.client).toBe("cli")
    }),
  )

  it.effect("experimentalIconDiscovery defaults to false", () =>
    Effect.gen(function* () {
      const flags = yield* readFlags.pipe(Effect.provide(fromConfig({})))

      expect(flags.experimentalIconDiscovery).toBe(false)
    }),
  )

  it.effect("disableExternalSkills defaults to false", () =>
    Effect.gen(function* () {
      const flags = yield* readFlags.pipe(Effect.provide(fromConfig({})))

      expect(flags.disableExternalSkills).toBe(false)
    }),
  )

  it.effect("disableExternalSkills reads koda_DISABLE_EXTERNAL_SKILLS", () =>
    Effect.gen(function* () {
      const flags = yield* readFlags.pipe(Effect.provide(fromConfig({ koda_DISABLE_EXTERNAL_SKILLS: "true" })))

      expect(flags.disableExternalSkills).toBe(true)
    }),
  )

  it.effect("disableLspDownload defaults to false", () =>
    Effect.gen(function* () {
      const flags = yield* readFlags.pipe(Effect.provide(fromConfig({})))

      expect(flags.disableLspDownload).toBe(false)
    }),
  )

  it.effect("disableLspDownload reads koda_DISABLE_LSP_DOWNLOAD", () =>
    Effect.gen(function* () {
      const flags = yield* readFlags.pipe(Effect.provide(fromConfig({ koda_DISABLE_LSP_DOWNLOAD: "true" })))

      expect(flags.disableLspDownload).toBe(true)
    }),
  )

  it.effect("disableClaudeCodePrompt defaults to false", () =>
    Effect.gen(function* () {
      const flags = yield* readFlags.pipe(Effect.provide(fromConfig({})))

      expect(flags.disableClaudeCodePrompt).toBe(false)
    }),
  )

  it.effect("disableClaudeCodePrompt reads koda_DISABLE_CLAUDE_CODE_PROMPT", () =>
    Effect.gen(function* () {
      const flags = yield* readFlags.pipe(Effect.provide(fromConfig({ koda_DISABLE_CLAUDE_CODE_PROMPT: "true" })))

      expect(flags.disableClaudeCodePrompt).toBe(true)
    }),
  )

  it.effect("disableClaudeCodePrompt inherits koda_DISABLE_CLAUDE_CODE", () =>
    Effect.gen(function* () {
      const flags = yield* readFlags.pipe(Effect.provide(fromConfig({ koda_DISABLE_CLAUDE_CODE: "true" })))

      expect(flags.disableClaudeCodePrompt).toBe(true)
    }),
  )

  it.effect("experimentalIconDiscovery reads koda_EXPERIMENTAL_ICON_DISCOVERY", () =>
    Effect.gen(function* () {
      const flags = yield* readFlags.pipe(Effect.provide(fromConfig({ koda_EXPERIMENTAL_ICON_DISCOVERY: "true" })))

      expect(flags.experimentalIconDiscovery).toBe(true)
    }),
  )

  it.effect("experimentalIconDiscovery inherits koda_EXPERIMENTAL", () =>
    Effect.gen(function* () {
      const flags = yield* readFlags.pipe(Effect.provide(fromConfig({ koda_EXPERIMENTAL: "true" })))

      expect(flags.experimentalIconDiscovery).toBe(true)
    }),
  )

  it.effect("specific experimental flags override koda_EXPERIMENTAL", () =>
    Effect.gen(function* () {
      const flags = yield* readFlags.pipe(
        Effect.provide(
          fromConfig({
            koda_EXPERIMENTAL: "true",
            koda_EXPERIMENTAL_ICON_DISCOVERY: "false",
          }),
        ),
      )

      expect(flags.experimentalIconDiscovery).toBe(false)
    }),
  )

  it.effect("experimentalOxfmt defaults to false", () =>
    Effect.gen(function* () {
      const flags = yield* readFlags.pipe(Effect.provide(fromConfig({})))

      expect(flags.experimentalOxfmt).toBe(false)
    }),
  )

  it.effect("experimentalOxfmt is enabled by koda_EXPERIMENTAL_OXFMT", () =>
    Effect.gen(function* () {
      const flags = yield* readFlags.pipe(
        Effect.provide(
          fromConfig({
            koda_EXPERIMENTAL_OXFMT: "true",
          }),
        ),
      )

      expect(flags.experimentalOxfmt).toBe(true)
    }),
  )

  it.effect("experimentalOxfmt inherits koda_EXPERIMENTAL", () =>
    Effect.gen(function* () {
      const flags = yield* readFlags.pipe(
        Effect.provide(
          fromConfig({
            koda_EXPERIMENTAL: "true",
          }),
        ),
      )

      expect(flags.experimentalOxfmt).toBe(true)
    }),
  )

  for (const input of [
    { name: "absent", config: {}, expected: undefined },
    {
      name: "valid positive integer",
      config: { koda_EXPERIMENTAL_BASH_DEFAULT_TIMEOUT_MS: "1234" },
      expected: 1234,
    },
    {
      name: "invalid string",
      config: { koda_EXPERIMENTAL_BASH_DEFAULT_TIMEOUT_MS: "nope" },
      expected: undefined,
    },
    { name: "zero", config: { koda_EXPERIMENTAL_BASH_DEFAULT_TIMEOUT_MS: "0" }, expected: undefined },
    { name: "negative", config: { koda_EXPERIMENTAL_BASH_DEFAULT_TIMEOUT_MS: "-1" }, expected: undefined },
    {
      name: "non-integer",
      config: { koda_EXPERIMENTAL_BASH_DEFAULT_TIMEOUT_MS: "1.5" },
      expected: undefined,
    },
  ]) {
    it.effect(`parses bashDefaultTimeoutMs from config: ${input.name}`, () =>
      Effect.gen(function* () {
        const flags = yield* readFlags.pipe(Effect.provide(fromConfig(input.config)))

        expect(flags.bashDefaultTimeoutMs).toBe(input.expected)
      }),
    )
  }

  for (const input of [
    { name: "absent", config: {}, expected: undefined },
    {
      name: "valid positive integer",
      config: { koda_EXPERIMENTAL_OUTPUT_TOKEN_MAX: "1234" },
      expected: 1234,
    },
    {
      name: "invalid string",
      config: { koda_EXPERIMENTAL_OUTPUT_TOKEN_MAX: "nope" },
      expected: undefined,
    },
    { name: "zero", config: { koda_EXPERIMENTAL_OUTPUT_TOKEN_MAX: "0" }, expected: undefined },
    { name: "negative", config: { koda_EXPERIMENTAL_OUTPUT_TOKEN_MAX: "-1" }, expected: undefined },
    {
      name: "non-integer",
      config: { koda_EXPERIMENTAL_OUTPUT_TOKEN_MAX: "1.5" },
      expected: undefined,
    },
  ]) {
    it.effect(`parses outputTokenMax from config: ${input.name}`, () =>
      Effect.gen(function* () {
        const flags = yield* readFlags.pipe(Effect.provide(fromConfig(input.config)))

        expect(flags.outputTokenMax).toBe(input.expected)
      }),
    )
  }

  it.effect("layer ignores the active ConfigProvider for omitted test overrides", () =>
    Effect.gen(function* () {
      const flags = yield* readFlags.pipe(
        Effect.provide(RuntimeFlags.layer()),
        Effect.provide(
          ConfigProvider.layer(
            ConfigProvider.fromUnknown({
              koda_PURE: "true",
              koda_DISABLE_DEFAULT_PLUGINS: "true",
              koda_DISABLE_EXTERNAL_SKILLS: "true",
              koda_DISABLE_LSP_DOWNLOAD: "true",
              koda_EXPERIMENTAL: "true",
              koda_ENABLE_EXA: "true",
              koda_EXPERIMENTAL_BASH_DEFAULT_TIMEOUT_MS: "1234",
              koda_CLIENT: "desktop",
            }),
          ),
        ),
      )

      expect(flags.pure).toBe(false)
      expect(flags.disableDefaultPlugins).toBe(false)
      expect(flags.disableEmbeddedWebUi).toBe(false)
      expect(flags.disableExternalSkills).toBe(false)
      expect(flags.disableLspDownload).toBe(false)
      expect(flags.disableClaudeCodePrompt).toBe(false)
      expect(flags.disableClaudeCodeSkills).toBe(false)
      expect(flags.enableExa).toBe(false)
      expect(flags.experimentalIconDiscovery).toBe(false)
      expect(flags.experimentalOxfmt).toBe(false)
      expect(flags.outputTokenMax).toBeUndefined()
      expect(flags.bashDefaultTimeoutMs).toBeUndefined()
      expect(flags.client).toBe("cli")
    }),
  )

  it.effect("disableClaudeCodeSkills defaults to false", () =>
    Effect.gen(function* () {
      const flags = yield* readFlags.pipe(Effect.provide(fromConfig({})))

      expect(flags.disableClaudeCodeSkills).toBe(false)
    }),
  )

  it.effect("disableClaudeCodeSkills reads koda_DISABLE_CLAUDE_CODE_SKILLS", () =>
    Effect.gen(function* () {
      const flags = yield* readFlags.pipe(Effect.provide(fromConfig({ koda_DISABLE_CLAUDE_CODE_SKILLS: "true" })))

      expect(flags.disableClaudeCodeSkills).toBe(true)
    }),
  )

  it.effect("disableClaudeCodeSkills inherits koda_DISABLE_CLAUDE_CODE", () =>
    Effect.gen(function* () {
      const flags = yield* readFlags.pipe(Effect.provide(fromConfig({ koda_DISABLE_CLAUDE_CODE: "true" })))

      expect(flags.disableClaudeCodeSkills).toBe(true)
    }),
  )
})
