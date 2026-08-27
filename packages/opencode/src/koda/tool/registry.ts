import { RecallTool } from "../../tool/recall"
import { BackgroundProcessTool } from "./background-process"
import { GenerateImageTool } from "./generate-image"
import { InteractiveTerminalTool } from "./interactive-terminal"
import { MemoryRecallTool } from "./memory-recall"
import { MemorySaveTool } from "./memory-save"
import { SelfEvolveTool } from "./self-evolve"
import { NotifyUserTool } from "./notify-user"
import { SendFileTool } from "./send-file"
import * as Tool from "../../tool/tool"
import { Flag } from "@opencode-ai/core/flag/flag"
import { Effect } from "effect"
import { kodaSessions } from "@/koda-sessions/koda-sessions"
import * as Log from "@opencode-ai/core/util/log"
import type { Config } from "@/config/config"
import { Agent } from "@/agent/agent"
import * as Truncate from "@/tool/truncate"
import { InstanceState } from "@/effect/instance-state"
import { kodaMemory } from "@koda/koda-memory/effect"
import { MemoryPaths } from "@koda/koda-memory/effect/paths"

const log = Log.create({ service: "koda-tool-registry" })
type Deps = { agent: Agent.Interface; truncate: Truncate.Interface; indexing?: boolean }
type Loaders = {
  indexing?: () => Promise<{ kodaIndexing: { ready: () => boolean } }>
  semantic?: () => Promise<Pick<typeof import("@/koda/tool/semantic-search"), "SemanticSearchTool">>
}

export namespace kodaToolRegistry {
  const hint =
    "- When you are doing an open-ended search where you do not know the exact symbol name, use the `semantic_search` tool first to narrow down the search scope, then follow up with `Grep` and/or `Read`"

  export function indexing(
    config: Pick<Config.Info, "indexing">,
    global?: Pick<Config.Info, "indexing">,
  ): boolean | undefined {
    return config.indexing?.enabled ?? global?.indexing?.enabled
  }

  export function usePatch(input: { modelID: string; family?: string }) {
    if (process.env["koda_E2E_LLM_URL"]) return true

    const id = input.modelID.toLowerCase()
    const family = input.family?.toLowerCase()
    if (id.includes("gpt-4") || family?.startsWith("gpt-4")) return false
    if (id.includes("oss") || family?.includes("oss") || family === "gpt-image") return false
    if (id.includes("gpt-")) return true
    return family?.startsWith("gpt") ?? false
  }

  /** Resolve Koda-specific tool metadata outside InstanceState so outer registry
   * dependencies are satisfied once rather than leaking into per-project state. */
  export function infos() {
    return Effect.gen(function* () {
      const recall = yield* RecallTool
      const memory = yield* MemoryRecallTool
      const save = yield* MemorySaveTool
      const evolve = yield* SelfEvolveTool
      const process = yield* BackgroundProcessTool
      const image = yield* GenerateImageTool
      const terminal = yield* InteractiveTerminalTool
      // The notify_user tool depends on kodaSessions.Service, which the tool-registry layer provides
      // via kodaSessions.defaultLayer (see src/tool/registry.ts). Grabs the service from the surrounding
      // context here and injects it into the tool's init Effect.
      const sessions = yield* kodaSessions.Service
      const notify = yield* NotifyUserTool.pipe(Effect.provideService(kodaSessions.Service, sessions))
      const send = yield* SendFileTool
      return { recall, memory, save, evolve, process, image, terminal, notify, send }
    })
  }

  /** Finalize koda-specific tools into Tool.Defs. Call this inside the InstanceState state Effect —
   * it has no Service deps beyond what Tool.init itself needs. */
  export function build(
    tools: {
      recall: Tool.Info
      memory: Tool.Info
      save: Tool.Info
      evolve: Tool.Info
      process: Tool.Info
      image: Tool.Info
      terminal?: Tool.Info
      notify: Tool.Info
      send: Tool.Info
    },
    deps: Deps,
    loaders: Loaders = {},
  ) {
    return Effect.gen(function* () {
      const base = yield* Effect.all({
        recall: Tool.init(tools.recall),
        memory: Tool.init(tools.memory),
        save: Tool.init(tools.save),
        evolve: Tool.init(tools.evolve),
        process: Tool.init(tools.process),
        image: Tool.init(tools.image),
        notify: Tool.init(tools.notify),
        send: Tool.init(tools.send),
      })
      const terminal = tools.terminal ? yield* Tool.init(tools.terminal) : undefined
      const semantic = yield* semanticTool(deps, loaders)
      return { ...base, terminal, semantic }
    })
  }

  function semanticTool(deps: Deps, loaders: Loaders) {
    return Effect.gen(function* () {
      const ready = yield* deps.indexing === undefined
        ? (() => {
            const indexing = loaders.indexing ?? (() => import("@/koda/indexing"))
            return Effect.tryPromise(() => indexing().then((mod) => mod.kodaIndexing.ready())).pipe(
              Effect.catch((err) =>
                Effect.sync(() => {
                  log.warn("semantic search unavailable", { err })
                  return false
                }),
              ),
            )
          })()
        : Effect.succeed(deps.indexing)
      if (!ready) return undefined

      const semantic = loaders.semantic ?? (() => import("@/koda/tool/semantic-search"))
      const mod = yield* Effect.tryPromise(() => semantic()).pipe(
        Effect.catch((err) =>
          Effect.sync(() => {
            log.warn("semantic search tool unavailable", { err })
            return undefined
          }),
        ),
      )
      if (!mod) return undefined

      const info = yield* mod.SemanticSearchTool.pipe(
        Effect.provideService(Agent.Service, deps.agent),
        Effect.provideService(Truncate.Service, deps.truncate),
      )
      if (!info) return undefined
      return yield* Tool.init(info)
    })
  }

  /** Hide human-driven tools from agents that cannot interact with the user directly. */
  export function available(tool: Tool.Def, agent: Agent.Info) {
    if (tool.id === "notify_user") return kodaSessions.remoteStatus().enabled
    if (tool.id === "send_file") return kodaSessions.remoteStatus().connected
    if (tool.id !== "interactive_terminal") return true
    return agent.mode === "primary"
  }

  /** koda-specific tools to append to the builtin list */
  export function extra(
    tools: {
      semantic?: Tool.Def
      recall: Tool.Def
      memory: Tool.Def
      save: Tool.Def
      evolve: Tool.Def
      process: Tool.Def
      image: Tool.Def
      terminal?: Tool.Def
      notify: Tool.Def
      send: Tool.Def
    },
    cfg: { experimental?: { image_generation?: boolean } },
  ): Tool.Def[] {
    return [
      ...(cfg.experimental?.image_generation === true ? [tools.image] : []),
      ...(tools.semantic ? [tools.semantic] : []),
      tools.memory,
      tools.save,
      tools.evolve,
      tools.recall,
      tools.process,
      ...(tools.terminal ? [tools.terminal] : []),
      tools.notify,
      tools.send,
    ]
  }

  // Re-keyed to root string so invalidate() works across ctx identities.
  const memoryEnabledCache = new Map<string, { enabled: boolean; deadline: number }>()
  const MEMORY_ENABLED_CACHE_MAX = 512
  const MEMORY_ENABLED_TTL_MS = 5_000

  /** Drop the cached enabled flag for a root so the next probe re-reads fresh state.
   * Called by the MemoryEvents subscriber in bootstrap on every state mutation. */
  export function invalidateMemoryEnabled(root: string) {
    memoryEnabledCache.delete(root)
  }

  /** Per-turn cache of `kodaMemory.toolEnabled` keyed by root string, with a short TTL so the
   * step-loop coalesces probes inside a single turn. Cache is invalidated immediately on enable /
   * disable / purge / rebuild via the MemoryEvents bus (subscribed in koda/bootstrap.ts). */
  export function memoryToolsEnabled(input: { ctx: MemoryPaths.Ctx }) {
    return Effect.gen(function* () {
      const root = MemoryPaths.root({ ctx: input.ctx })
      const cached = memoryEnabledCache.get(root)
      if (cached && cached.deadline > Date.now()) return cached.enabled
      const enabled = yield* Effect.tryPromise({
        try: () => kodaMemory.toolEnabled({ ctx: input.ctx }),
        catch: (err) => err,
      }).pipe(
        Effect.catch((err) =>
          Effect.sync(() => {
            log.warn("memory tools unavailable", { error: String(err) })
            return false
          }),
        ),
      )
      memoryEnabledCache.set(root, { enabled, deadline: Date.now() + MEMORY_ENABLED_TTL_MS })
      if (memoryEnabledCache.size > MEMORY_ENABLED_CACHE_MAX) {
        const oldest = memoryEnabledCache.keys().next().value
        if (oldest !== undefined) memoryEnabledCache.delete(oldest)
      }
      return enabled
    })
  }
  /** Hide koda memory tools from the model when project memory is disabled. */
  export const applyVisibility = Effect.fn("kodaToolRegistry.applyVisibility")(function* (tools: Tool.Def[]) {
    const ctx = yield* InstanceState.context
    const memoryEnabled = yield* memoryToolsEnabled({ ctx })
    return tools.filter((tool) => {
      if (tool.id.startsWith("koda_memory_")) return memoryEnabled
      return true
    })
  })

  export function describe(tools: Tool.Def[], extra: { semantic?: Tool.Def }): Tool.Def[] {
    if (!extra.semantic) return tools
    return tools.map((tool) => {
      if (tool.id !== "glob" && tool.id !== "grep") return tool
      return { ...tool, description: `${tool.description}\n${hint}` }
    })
  }
}
