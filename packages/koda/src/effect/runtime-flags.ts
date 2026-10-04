import { Config, ConfigProvider, Context, Effect, Layer, Option } from "effect"
import { ConfigService } from "@/effect/config-service"

const bool = (name: string) => Config.boolean(name).pipe(Config.withDefault(false))
const positiveInteger = (name: string) =>
  Config.number(name).pipe(
    Config.map((value) => (Number.isInteger(value) && value > 0 ? value : undefined)),
    Config.orElse(() => Config.succeed(undefined)),
  )
const experimental = bool("KODA_EXPERIMENTAL")
const enabledByExperimental = (name: string) =>
  Config.all({ experimental, enabled: Config.boolean(name).pipe(Config.option) }).pipe(
    Config.map((flags) => Option.getOrElse(flags.enabled, () => flags.experimental)),
  )

export class Service extends ConfigService.Service<Service>()("@koda/RuntimeFlags", {
  autoShare: bool("KODA_AUTO_SHARE"),
  pure: bool("KODA_PURE"),
  disableDefaultPlugins: bool("KODA_DISABLE_DEFAULT_PLUGINS"),
  disableExternalSkills: bool("KODA_DISABLE_EXTERNAL_SKILLS"),
  disableLspDownload: bool("KODA_DISABLE_LSP_DOWNLOAD"),
  disableClaudeCodePrompt: Config.all({
    broad: bool("KODA_DISABLE_CLAUDE_CODE"),
    direct: bool("KODA_DISABLE_CLAUDE_CODE_PROMPT"),
  }).pipe(Config.map((flags) => flags.broad || flags.direct)),
  disableClaudeCodeSkills: Config.all({
    broad: bool("KODA_DISABLE_CLAUDE_CODE"),
    direct: bool("KODA_DISABLE_CLAUDE_CODE_SKILLS"),
  }).pipe(Config.map((flags) => flags.broad || flags.direct)),
  enableExa: Config.all({
    experimental,
    enabled: bool("KODA_ENABLE_EXA"),
    legacy: bool("KODA_EXPERIMENTAL_EXA"),
  }).pipe(Config.map((flags) => flags.experimental || flags.enabled || flags.legacy)),
  enableParallel: Config.all({
    enabled: bool("KODA_ENABLE_PARALLEL"),
    legacy: bool("KODA_EXPERIMENTAL_PARALLEL"),
  }).pipe(Config.map((flags) => flags.enabled || flags.legacy)),
  enableExperimentalModels: bool("KODA_ENABLE_EXPERIMENTAL_MODELS"),
  enableQuestionTool: bool("KODA_ENABLE_QUESTION_TOOL"),
  experimentalReferences: enabledByExperimental("KODA_EXPERIMENTAL_REFERENCES"),
  experimentalBackgroundSubagents: enabledByExperimental("KODA_EXPERIMENTAL_BACKGROUND_SUBAGENTS"),
  experimentalLspTy: bool("KODA_EXPERIMENTAL_LSP_TY"),
  experimentalLspTool: enabledByExperimental("KODA_EXPERIMENTAL_LSP_TOOL"),
  experimentalOxfmt: enabledByExperimental("KODA_EXPERIMENTAL_OXFMT"),
  experimentalPlanMode: enabledByExperimental("KODA_EXPERIMENTAL_PLAN_MODE"),
  experimentalCodeMode: enabledByExperimental("KODA_EXPERIMENTAL_CODE_MODE"),
  experimentalEventSystem: enabledByExperimental("KODA_EXPERIMENTAL_EVENT_SYSTEM"),
  experimentalWorkspaces: enabledByExperimental("KODA_EXPERIMENTAL_WORKSPACES"),
  experimentalIconDiscovery: enabledByExperimental("KODA_EXPERIMENTAL_ICON_DISCOVERY"),
  outputTokenMax: positiveInteger("KODA_EXPERIMENTAL_OUTPUT_TOKEN_MAX"),
  bashDefaultTimeoutMs: positiveInteger("KODA_EXPERIMENTAL_BASH_DEFAULT_TIMEOUT_MS"),
  experimentalNativeLlm: bool("KODA_EXPERIMENTAL_NATIVE_LLM"),
  experimentalWebSockets: bool("KODA_EXPERIMENTAL_WEBSOCKETS"),
  client: Config.string("KODA_CLIENT").pipe(Config.withDefault("cli")),
}) {}

export type Info = Context.Service.Shape<typeof Service>

const emptyConfigLayer = Service.layer.pipe(
  Layer.provide(ConfigProvider.layer(ConfigProvider.fromUnknown({}))),
  Layer.orDie,
)

export const layer = (overrides: Partial<Info> = {}) =>
  Layer.effect(
    Service,
    Effect.gen(function* () {
      const flags = yield* Service
      return Service.of({ ...flags, ...overrides })
    }),
  ).pipe(Layer.provide(emptyConfigLayer))

export const node = LayerNode.make({ service: Service, layer: Service.layer.pipe(Layer.orDie), deps: [] })

export * as RuntimeFlags from "./runtime-flags"
import { LayerNode } from "@koda-ai/core/effect/layer-node"
