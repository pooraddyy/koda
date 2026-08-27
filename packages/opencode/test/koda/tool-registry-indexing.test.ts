import { AppNodeBuilder } from "@opencode-ai/core/effect/app-node-builder"
import { afterEach, describe, expect, spyOn, test } from "bun:test"
import { Effect, Layer, Schema, Stream } from "effect"
import * as Log from "@opencode-ai/core/util/log"
import { Agent } from "../../src/agent/agent"
import { Bus } from "../../src/bus"
import { kodaIndexing } from "../../src/koda/indexing"
import { kodaBootstrap } from "../../src/koda/bootstrap"
import { kodaWatcher } from "../../src/koda/watcher"
import { kodaSessions } from "../../src/koda-sessions/koda-sessions"
import { kodaMemory } from "@koda/koda-memory/effect"
import { MemoryService } from "@koda/koda-memory/effect/service"
import { InstanceState } from "../../src/effect/instance-state"
import { kodaToolRegistry } from "../../src/koda/tool/registry"
import { Service as LifecycleHooks } from "../../src/koda/hooks/service"
import { CollaborationCoordinator } from "../../src/koda/orchestration/service"
import { Provider } from "../../src/provider/provider"
import { ProviderV2 } from "@opencode-ai/core/provider"
import { ModelV2 } from "@opencode-ai/core/model"
import { Session } from "../../src/session/session"
import { SessionSummary } from "../../src/session/summary"
import { ToolRegistry } from "../../src/tool/registry"
import type * as Tool from "../../src/tool/tool"
import { disposeAllInstances, provideTmpdirInstance } from "../fixture/fixture"
import * as CrossSpawnSpawner from "@opencode-ai/core/cross-spawn-spawner"
import { testEffect } from "../lib/effect"

const node = AppNodeBuilder.build(CrossSpawnSpawner.node)
const it = testEffect(Layer.mergeAll(AppNodeBuilder.build(Agent.node), AppNodeBuilder.build(ToolRegistry.node), node))
const ref = {
  providerID: ProviderV2.ID.make("test"),
  modelID: ModelV2.ID.make("test-model"),
}

afterEach(async () => {
  await disposeAllInstances()
})

describe("koda tool registry indexing", () => {
  const logger = Log.create({ service: "koda-tool-registry" })

  it.live("omits semantic_search without waiting for slow indexing startup", () =>
    provideTmpdirInstance(
      () =>
        Effect.gen(function* () {
          const avail = spyOn(kodaIndexing, "available").mockImplementation(() => new Promise<boolean>(() => {}))

          try {
            const registry = yield* ToolRegistry.Service
            const ids = yield* registry.ids()

            expect(ids).not.toContain("semantic_search")
            expect(ids).not.toContain("codesearch")
            expect(ids).toContain("question")
            expect(ids).toContain("read")
            expect(ids).toContain("suggest")
            expect(avail).not.toHaveBeenCalled()
          } finally {
            avail.mockRestore()
          }
        }),
      { git: true },
    ),
  )

  it.live("registers semantic search from config even when readiness throws", () =>
    provideTmpdirInstance(
      () =>
        Effect.gen(function* () {
          const err = new Error("ready failed")
          const ready = spyOn(kodaIndexing, "ready").mockImplementation(() => {
            throw err
          })
          const warn = spyOn(logger, "warn").mockImplementation(() => {})

          try {
            const registry = yield* ToolRegistry.Service
            const ids = yield* registry.ids()

            expect(ids).toContain("semantic_search")
            expect(ids).toContain("question")
            expect(ids).toContain("read")
            expect(ids).toContain("suggest")
            expect(warn).not.toHaveBeenCalled()
          } finally {
            ready.mockRestore()
            warn.mockRestore()
          }
        }),
      { git: true, config: { indexing: { enabled: true } } },
    ),
  )

  it.live("registers semantic search from config even when readiness rejects", () =>
    provideTmpdirInstance(
      () =>
        Effect.gen(function* () {
          const err = new Error("ready rejected")
          const ready = spyOn(kodaIndexing, "ready").mockImplementation(() => Promise.reject(err) as unknown as boolean)
          const warn = spyOn(logger, "warn").mockImplementation(() => {})

          try {
            const registry = yield* ToolRegistry.Service
            const ids = yield* registry.ids()

            expect(ids).toContain("semantic_search")
            expect(ids).toContain("question")
            expect(ids).toContain("read")
            expect(ids).toContain("suggest")
            expect(warn).not.toHaveBeenCalled()
          } finally {
            ready.mockRestore()
            warn.mockRestore()
          }
        }),
      { git: true, config: { indexing: { enabled: true } } },
    ),
  )

  it.live("registers semantic_search when indexing is enabled", () =>
    provideTmpdirInstance(
      () =>
        Effect.gen(function* () {
          const ready = spyOn(kodaIndexing, "ready").mockReturnValue(true)

          try {
            const registry = yield* ToolRegistry.Service
            const ids = yield* registry.ids()

            expect(ids).toContain("semantic_search")
          } finally {
            ready.mockRestore()
          }
        }),
      { git: true, config: { indexing: { enabled: true } } },
    ),
  )

  it.live("omits semantic_search hint from glob and grep descriptions when indexing is not ready", () =>
    provideTmpdirInstance(
      () =>
        Effect.gen(function* () {
          const ready = spyOn(kodaIndexing, "ready").mockReturnValue(false)

          try {
            const agent = yield* Agent.Service
            const build = yield* agent.get("build")
            const registry = yield* ToolRegistry.Service
            const tools = yield* registry.tools({ ...ref, agent: build })
            const glob = tools.find((tool) => tool.id === "glob")?.description ?? ""
            const grep = tools.find((tool) => tool.id === "grep")?.description ?? ""

            expect(glob).not.toContain("semantic_search")
            expect(grep).not.toContain("semantic_search")
          } finally {
            ready.mockRestore()
          }
        }),
      { git: true },
    ),
  )

  it.live("includes semantic_search hint in glob and grep descriptions when indexing is enabled", () =>
    provideTmpdirInstance(
      () =>
        Effect.gen(function* () {
          const ready = spyOn(kodaIndexing, "ready").mockReturnValue(true)

          try {
            const agent = yield* Agent.Service
            const build = yield* agent.get("build")
            const registry = yield* ToolRegistry.Service
            const tools = yield* registry.tools({ ...ref, agent: build })
            const ids = tools.map((tool) => tool.id)
            const glob = tools.find((tool) => tool.id === "glob")?.description ?? ""
            const grep = tools.find((tool) => tool.id === "grep")?.description ?? ""

            expect(ids).toContain("semantic_search")
            expect(glob).toContain("semantic_search")
            expect(grep).toContain("semantic_search")
          } finally {
            ready.mockRestore()
          }
        }),
      { git: true, config: { indexing: { enabled: true } } },
    ),
  )

  it.live("omits interactive_terminal from subagent definitions", () =>
    Effect.acquireUseRelease(
      Effect.sync(() => {
        const prev = process.env["koda_CLIENT"]
        process.env["koda_CLIENT"] = "cli"
        return prev
      }),
      () =>
        provideTmpdirInstance(
          () =>
            Effect.gen(function* () {
              const agent = yield* Agent.Service
              const build = yield* agent.get("build")
              const explore = yield* agent.get("explore")
              const registry = yield* ToolRegistry.Service
              const primary = yield* registry.tools({ ...ref, agent: build })
              const subagent = yield* registry.tools({ ...ref, agent: explore })

              expect(primary.map((tool) => tool.id)).toContain("interactive_terminal")
              expect(subagent.map((tool) => tool.id)).not.toContain("interactive_terminal")
            }),
          {
            git: true,
            config: { permission: { interactive_terminal: "allow" } },
          },
        ),
      (prev) =>
        Effect.sync(() => {
          if (prev === undefined) delete process.env["koda_CLIENT"]
          if (prev !== undefined) process.env["koda_CLIENT"] = prev
        }),
    ),
  )

  test("enables semantic search from indexing configuration before the index is ready", () => {
    expect(
      kodaToolRegistry.indexing({
        indexing: { enabled: true },
      }),
    ).toBe(true)
    expect(
      kodaToolRegistry.indexing({
        indexing: { enabled: false },
      }),
    ).toBe(false)
    expect(kodaToolRegistry.indexing({}, { indexing: { enabled: true } })).toBe(true)
  })

  it.live("omits memory tools when project memory is disabled but keeps koda_local_recall", () =>
    provideTmpdirInstance(
      () =>
        Effect.gen(function* () {
          const agent = yield* Agent.Service
          const build = yield* agent.get("build")
          const registry = yield* ToolRegistry.Service
          const tools = yield* registry.tools({ ...ref, agent: build })
          const ids = tools.map((tool) => tool.id)

          expect(ids).not.toContain("koda_memory_recall")
          expect(ids).not.toContain("koda_memory_save")
          // koda_local_recall is a transcript-recall tool gated by `recall: "ask"` in agent
          // permissions; it must NOT be coupled to project-memory enablement.
          expect(ids).toContain("koda_local_recall")
        }),
      { git: true },
    ),
  )

  it.live("memoryToolsEnabled coalesces consecutive probes within the TTL", () =>
    provideTmpdirInstance(
      () =>
        Effect.gen(function* () {
          const ctx = yield* InstanceState.context
          const probe = spyOn(kodaMemory, "toolEnabled")

          try {
            const a = yield* kodaToolRegistry.memoryToolsEnabled({ ctx })
            const b = yield* kodaToolRegistry.memoryToolsEnabled({ ctx })
            const c = yield* kodaToolRegistry.memoryToolsEnabled({ ctx })

            expect([a, b, c]).toEqual([false, false, false])
            // Cache hit: only the first call should reach kodaMemory.toolEnabled.
            expect(probe).toHaveBeenCalledTimes(1)
          } finally {
            probe.mockRestore()
          }
        }),
      { git: true },
    ),
  )

  it.live("memoryToolsEnabled reflects enable/disable immediately after invalidate", () =>
    provideTmpdirInstance(
      () =>
        Effect.gen(function* () {
          const ctx = yield* InstanceState.context
          const root = (yield* Effect.promise(() => kodaMemory.prepare({ ctx }))).toString()

          const first = yield* kodaToolRegistry.memoryToolsEnabled({ ctx })
          expect(first).toBe(false)

          yield* Effect.promise(() => kodaMemory.enable({ ctx }))

          // The bootstrap MemoryEvents subscriber invalidates on mutation; call it directly here.
          kodaToolRegistry.invalidateMemoryEnabled(root)
          const afterEnable = yield* kodaToolRegistry.memoryToolsEnabled({ ctx })
          expect(afterEnable).toBe(true)

          yield* Effect.promise(() => kodaMemory.disable({ ctx }))

          kodaToolRegistry.invalidateMemoryEnabled(root)
          const afterDisable = yield* kodaToolRegistry.memoryToolsEnabled({ ctx })
          expect(afterDisable).toBe(false)
        }),
      { git: true },
    ),
  )

  it.live("includes memory tools when project memory is enabled", () =>
    provideTmpdirInstance(
      () =>
        Effect.gen(function* () {
          const ctx = yield* InstanceState.context
          yield* Effect.promise(() => kodaMemory.enable({ ctx }))

          const agent = yield* Agent.Service
          const build = yield* agent.get("build")
          const registry = yield* ToolRegistry.Service
          const tools = yield* registry.tools({ ...ref, agent: build })
          const ids = tools.map((tool) => tool.id)

          expect(ids).toContain("koda_memory_recall")
          expect(ids).toContain("koda_memory_save")
          expect(ids).toContain("koda_local_recall")
        }),
      { git: true },
    ),
  )

  test("conditionally includes koda registry extras", () => {
    const prev = process.env["koda_CLIENT"]
    const def = (id: string): Tool.Def => ({
      id,
      description: id,
      parameters: Schema.String,
      execute: () => Effect.succeed({ title: id, output: id, metadata: {} }),
    })
    const tools = {
      semantic: def("semantic_search"),
      recall: def("recall"),
      memory: def("koda_memory_recall"),
      save: def("koda_memory_save"),
      evolve: def("koda_evolve"),
      process: def("background_process"),
      image: def("generate_image"),
      terminal: def("interactive_terminal"),
      notify: def("notify_user"),
      send: def("send_file"),
    }

    try {
      process.env["koda_CLIENT"] = "cli"
      expect(kodaToolRegistry.extra(tools, {}).map((tool) => tool.id)).toEqual([
        "semantic_search",
        "koda_memory_recall",
        "koda_memory_save",
        "koda_evolve",
        "recall",
        "background_process",
        "interactive_terminal",
        "notify_user",
        "send_file",
      ])
      expect(
        kodaToolRegistry.extra(tools, { experimental: { image_generation: true } }).map((tool) => tool.id),
      ).toEqual([
        "generate_image",
        "semantic_search",
        "koda_memory_recall",
        "koda_memory_save",
        "koda_evolve",
        "recall",
        "background_process",
        "interactive_terminal",
        "notify_user",
        "send_file",
      ])

      expect(kodaToolRegistry.extra({ ...tools, semantic: undefined }, {}).map((tool) => tool.id)).toEqual([
        "koda_memory_recall",
        "koda_memory_save",
        "koda_evolve",
        "recall",
        "background_process",
        "interactive_terminal",
        "notify_user",
        "send_file",
      ])
    } finally {
      if (prev === undefined) delete process.env["koda_CLIENT"]
      if (prev !== undefined) process.env["koda_CLIENT"] = prev
    }
  })

  test("logs indexing bootstrap failures without blocking session bootstrap", async () => {
    const platform = process.env["koda_PLATFORM"]
    process.env["koda_PLATFORM"] = "cli"
    const logger = Log.create({ service: "koda-bootstrap" })
    const err = new Error("indexing init failed")
    const calls: string[] = []
    const sessions = Layer.succeed(
      kodaSessions.Service,
      kodaSessions.Service.of({
        init: () => Effect.sync(() => calls.push("sessions")),
        sendAgentNotification: () => Effect.succeed({ ok: false as const, reason: "not_connected" }),
        reportSessionTitle: () => Effect.succeed({ ok: false as const, reason: "not_connected" }),
      }),
    )
    const bus = Layer.succeed(
      Bus.Service,
      Bus.Service.of({
        publish: () => Effect.void,
        subscribe: () => Effect.succeed(Stream.empty),
        subscribeAll: () => Effect.succeed(Stream.empty),
        subscribeCallback: () => Effect.succeed(() => {}),
        subscribeAllCallback: () => Effect.succeed(() => {}),
      }),
    )
    const memory = Layer.succeed(MemoryService.Service, MemoryService.make())
    const session = Layer.succeed(Session.Service, {} as Session.Interface)
    const summary = Layer.succeed(SessionSummary.Service, {} as SessionSummary.Interface)
    const provider = Layer.succeed(Provider.Service, {} as Provider.Interface)
    const watcher = Layer.succeed(
      kodaWatcher.Service,
      kodaWatcher.Service.of({ init: () => Effect.void }),
    )
    const hooks = Layer.succeed(
      LifecycleHooks,
      LifecycleHooks.of({
        list: () => Effect.succeed([]),
        run: () => Effect.succeed({ allowed: true, outcomes: [] }),
      }),
    )
    const coordinator = Layer.succeed(
      CollaborationCoordinator.Service,
      { recover: () => Effect.succeed([]) } as CollaborationCoordinator.Interface,
    )
    const indexing = spyOn(kodaIndexing, "init").mockRejectedValue(err)
    const warn = spyOn(logger, "warn").mockImplementation(() => {})

    try {
      await Effect.runPromise(
        kodaBootstrap.Service.use((svc) => svc.init()).pipe(
          Effect.provide(
            kodaBootstrap.layer.pipe(Layer.provide([sessions, bus, memory, session, summary, provider, watcher, hooks, coordinator])),
          ),
          Effect.scoped,
        ),
      )
      await new Promise((resolve) => setTimeout(resolve, 0))

      expect(calls).toEqual(["sessions"])
      expect(indexing).toHaveBeenCalledTimes(1)
      expect(warn).toHaveBeenCalledWith("indexing bootstrap failed", { err })
    } finally {
      if (platform === undefined) delete process.env["koda_PLATFORM"]
      else process.env["koda_PLATFORM"] = platform
      indexing.mockRestore()
      warn.mockRestore()
    }
  })
})
