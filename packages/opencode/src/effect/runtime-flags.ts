import { Config, ConfigProvider, Context, Effect, Layer, Option } from "effect"
import { ConfigService } from "@/effect/config-service"

const bool = (name: string) => Config.boolean(name).pipe(Config.withDefault(false))
const positiveInteger = (name: string) =>
  Config.number(name).pipe(
    Config.map((value) => (Number.isInteger(value) && value > 0 ? value : undefined)),
    Config.orElse(() => Config.succeed(undefined)),
  )
const experimental = bool("koda_EXPERIMENTAL")
const enabledByExperimental = (name: string) =>
  Config.all({ experimental, enabled: Config.boolean(name).pipe(Config.option) }).pipe(
    Config.map((flags) => Option.getOrElse(flags.enabled, () => flags.experimental)),
  )

export class Service extends ConfigService.Service<Service>()("@opencode/RuntimeFlags", {
  autoShare: bool("koda_AUTO_SHARE"),
  pure: bool("koda_PURE"),
  disableDefaultPlugins: bool("koda_DISABLE_DEFAULT_PLUGINS"),
  disableChannelDb: bool("koda_DISABLE_CHANNEL_DB"), // koda_change
  disableEmbeddedWebUi: bool("koda_DISABLE_EMBEDDED_WEB_UI"),
  disableExternalSkills: bool("koda_DISABLE_EXTERNAL_SKILLS"),
  disableSkillShell: bool("koda_DISABLE_SKILL_SHELL"), // koda_change - disable shell injection in skill bodies
  disableLspDownload: bool("koda_DISABLE_LSP_DOWNLOAD"),
  skipMigrations: bool("koda_SKIP_MIGRATIONS"), // koda_change
  disableClaudeCodePrompt: Config.all({
    broad: bool("koda_DISABLE_CLAUDE_CODE"),
    direct: bool("koda_DISABLE_CLAUDE_CODE_PROMPT"),
  }).pipe(Config.map((flags) => flags.broad || flags.direct)),
  disableClaudeCodeSkills: Config.all({
    broad: bool("koda_DISABLE_CLAUDE_CODE"),
    direct: bool("koda_DISABLE_CLAUDE_CODE_SKILLS"),
  }).pipe(Config.map((flags) => flags.broad || flags.direct)),
  enableExa: Config.all({
    experimental,
    enabled: bool("koda_ENABLE_EXA"),
    legacy: bool("koda_EXPERIMENTAL_EXA"),
  }).pipe(Config.map((flags) => flags.experimental || flags.enabled || flags.legacy)),
  enableParallel: Config.all({
    enabled: bool("koda_ENABLE_PARALLEL"),
    legacy: bool("koda_EXPERIMENTAL_PARALLEL"),
  }).pipe(Config.map((flags) => flags.enabled || flags.legacy)),
  enableExperimentalModels: bool("koda_ENABLE_EXPERIMENTAL_MODELS"),
  enableQuestionTool: bool("koda_ENABLE_QUESTION_TOOL"),
  experimentalScout: enabledByExperimental("koda_EXPERIMENTAL_SCOUT"), // koda_change
  experimentalReferences: enabledByExperimental("koda_EXPERIMENTAL_REFERENCES"),
  // koda_change start - enabled by default, with an opt-out kill switch
  experimentalBackgroundSubagents: Config.boolean("koda_EXPERIMENTAL_BACKGROUND_SUBAGENTS").pipe(
    Config.withDefault(true),
  ),
  // koda_change end
  experimentalLspTy: bool("koda_EXPERIMENTAL_LSP_TY"),
  experimentalLspTool: enabledByExperimental("koda_EXPERIMENTAL_LSP_TOOL"),
  experimentalOxfmt: enabledByExperimental("koda_EXPERIMENTAL_OXFMT"),
  experimentalPlanMode: enabledByExperimental("koda_EXPERIMENTAL_PLAN_MODE"),
  experimentalCodeMode: enabledByExperimental("koda_EXPERIMENTAL_CODE_MODE"),
  experimentalEventSystem: enabledByExperimental("koda_EXPERIMENTAL_EVENT_SYSTEM"),
  experimentalSessionSwitcher: enabledByExperimental("koda_EXPERIMENTAL_SESSION_SWITCHER"), // koda_change
  experimentalWorkspaces: enabledByExperimental("koda_EXPERIMENTAL_WORKSPACES"),
  experimentalIconDiscovery: enabledByExperimental("koda_EXPERIMENTAL_ICON_DISCOVERY"),
  experimentalMcpApps: enabledByExperimental("koda_EXPERIMENTAL_MCP_APPS"), // koda_change
  outputTokenMax: positiveInteger("koda_EXPERIMENTAL_OUTPUT_TOKEN_MAX"),
  bashDefaultTimeoutMs: positiveInteger("koda_EXPERIMENTAL_BASH_DEFAULT_TIMEOUT_MS"),
  experimentalNativeLlm: bool("koda_EXPERIMENTAL_NATIVE_LLM"),
  experimentalWebSockets: bool("koda_EXPERIMENTAL_WEBSOCKETS"),
  client: Config.string("koda_CLIENT").pipe(Config.withDefault("cli")),
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
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
