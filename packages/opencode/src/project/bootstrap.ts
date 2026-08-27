import { makeGlobalNode } from "@opencode-ai/core/effect/app-node"
import { Plugin } from "../plugin"
import { Format } from "../format"
import { LSP } from "@/lsp/lsp"
import { Snapshot } from "../snapshot"
import * as Project from "./project"
import * as Vcs from "./vcs"
import { InstanceState } from "@/effect/instance-state"
// koda_change start - ShareNext init is handled by kodaBootstrap; upstream dropped File/FileWatcher bootstrap init
import { kodaBootstrap } from "@/koda/bootstrap"
import { CollaborationCoordinator } from "@/koda/orchestration/service"
// import { ShareNext } from "@/share/share-next"
// koda_change end
import { Effect, Layer } from "effect"
import { Config } from "@/config/config"
import { Service } from "./bootstrap-service"

export { Service } from "./bootstrap-service"
export type { Interface } from "./bootstrap-service"

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    // Yield each bootstrap dep at layer init so `run` itself has R = never.
    // InstanceStore imports only the lightweight tag from bootstrap-service.ts,
    // so it can depend on bootstrap without importing this implementation graph.
    const config = yield* Config.Service
    const format = yield* Format.Service
    const lsp = yield* LSP.Service
    const plugin = yield* Plugin.Service
    const project = yield* Project.Service
    // koda_change start
    const koda = yield* kodaBootstrap.Service
    // const shareNext = yield* ShareNext.Service
    // koda_change end
    const snapshot = yield* Snapshot.Service
    const vcs = yield* Vcs.Service

    const run = Effect.gen(function* () {
      const ctx = yield* InstanceState.context
      yield* Effect.logDebug("bootstrapping", { directory: ctx.directory }) // koda_change - avoid printing on every startup
      // everything depends on config so eager load it for nice traces
      yield* config.get()
      // Plugin can mutate config so it has to be initialized before anything else.
      yield* plugin.init()
      yield* koda.init().pipe(Effect.catchCause((cause) => Effect.logWarning("koda init failed", { cause }))) // koda_change
      // Each service self-manages its own slow work via Effect.forkScoped against
      // its per-instance state scope. We just await materialization here.
      yield* Effect.forEach(
        [lsp, format, vcs, snapshot, project], // koda_change - kodaBootstrap owns ShareNext initialization
        (s) => s.init().pipe(Effect.catchCause((cause) => Effect.logWarning("init failed", { cause }))),
        { concurrency: "unbounded", discard: true },
      ).pipe(Effect.withSpan("InstanceBootstrap.init"))
    }).pipe(Effect.withSpan("InstanceBootstrap"))

    return Service.of({ run })
  }),
)

export const node = makeGlobalNode({
  service: Service,
  layer: layer,
  deps: [
    Config.node,
    Format.node,
    LSP.node,
    Plugin.node,
    Project.node,
    kodaBootstrap.node,
    CollaborationCoordinator.node,
    Snapshot.node,
    Vcs.node,
  ], // koda_change
})

export * as InstanceBootstrap from "./bootstrap"
