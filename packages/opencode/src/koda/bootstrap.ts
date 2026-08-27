import { Cause, Context, Effect, Layer } from "effect"
import { EffectBridge } from "@/effect/bridge"
import { kodaSessions } from "@/koda-sessions/koda-sessions"
import * as Log from "@opencode-ai/core/util/log"
import { Global } from "@opencode-ai/core/global"
import { InstallationVersion } from "@opencode-ai/core/installation/version"
import path from "node:path"
import { Bus } from "@/bus"
import { Provider } from "@/provider/provider"
import { Session } from "@/session/session"
import { SessionSummary } from "@/session/summary"
import { SessionExport } from "@/koda/session-export"
import { createWorkspaceProvider } from "@/koda/session-export/workspace-provider"
import { Instance } from "@/koda/instance"
import { Identity } from "@koda/koda-telemetry"
import { MemoryLifecycle } from "@/koda/memory/turn"
import { MemoryService } from "@koda/koda-memory/effect/service"
import { MemoryEvents } from "@/koda/memory/events"
import { installMemoryRuntime } from "@/koda/memory/runtime"
import { kodaToolRegistry } from "@/koda/tool/registry"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { kodaWatcher } from "@/koda/watcher"
import { kodaSession } from "@/koda/session"
import { Service as LifecycleHooks, node as LifecycleHooksNode } from "@/koda/hooks/service"
import { CollaborationCoordinator } from "@/koda/orchestration/service"
import { AppNodeBuilder } from "@opencode-ai/core/effect/app-node-builder" // koda_change

const log = Log.create({ service: "koda-bootstrap" })

export namespace kodaBootstrap {
  export interface Interface {
    readonly init: () => Effect.Effect<void, unknown>
  }

  export class Service extends Context.Service<Service, Interface>()("@koda/Bootstrap") {}

  export const layer = Layer.effect(
    Service,
    Effect.gen(function* () {
      // Bind the package memory effect layer to opencode (paths, instance binder, logger, event sink).
      installMemoryRuntime()
      const koda = yield* kodaSessions.Service
      const bus = yield* Bus.Service
      const sessions = yield* Session.Service
      const summary = yield* SessionSummary.Service
      const provider = yield* Provider.Service
      const memory = yield* MemoryService.Service
      const watcher = yield* kodaWatcher.Service
      const hooks = yield* LifecycleHooks
      const coordinator = yield* CollaborationCoordinator.Service

      const init = Effect.fn("kodaBootstrap.init")(function* () {
        yield* watcher.init()
        yield* coordinator
          .recover()
          .pipe(
            Effect.catchCause((cause) =>
              Effect.sync(() => log.warn("collaboration recovery failed", { err: Cause.squash(cause) })),
            ),
          )
        yield* koda.init()
        yield* MemoryLifecycle.subscribe({ bus, sessions, summary, provider, memory })
        yield* bus.subscribeCallback(kodaSession.Event.TurnOpen, (event) => {
          void hooks.run({
            event: "turn.start",
            timestamp: Date.now(),
            sessionID: String(event.properties.sessionID),
            data: {},
          })
        })
        yield* bus.subscribeCallback(kodaSession.Event.TurnClose, (event) => {
          const lifecycleEvent =
            event.properties.reason === "completed"
              ? "turn.complete"
              : event.properties.reason === "interrupted" || event.properties.reason === "superseded"
                ? "turn.interrupted"
                : "turn.error"
          void hooks.run({
            event: lifecycleEvent,
            timestamp: Date.now(),
            sessionID: String(event.properties.sessionID),
            ...(event.properties.parentID ? { parentSessionID: String(event.properties.parentID) } : {}),
            data: { reason: event.properties.reason },
          })
        })
        // Invalidate enabled cache on every memory state mutation (properties.directory holds the memory root).
        yield* bus.subscribeCallback(MemoryEvents.Status, (evt) =>
          kodaToolRegistry.invalidateMemoryEnabled(evt.properties.directory),
        )
        yield* bus.subscribeCallback(MemoryEvents.Updated, (evt) =>
          kodaToolRegistry.invalidateMemoryEnabled(evt.properties.directory),
        )
        // Session export bootstrap.
        yield* Effect.gen(function* () {
          if (!SessionExport.enabled) return
          const anon = yield* EffectBridge.fromPromise(() =>
            Identity.getMachineId().catch((err) => {
              log.warn("session export identity failed", { err })
              return undefined
            }),
          )
          SessionExport.init({
            agentVersion: InstallationVersion,
            anonId: anon,
            dbPath: path.join(Global.Path.data, "session-export.db"),
            workspaceKey: Instance.directory,
            subscribeAll: (cb) => Bus.subscribeAll(cb),
            snapshotProvider: createWorkspaceProvider({
              root: Instance.directory,
              statePath: path.join(Global.Path.data, "session-export-workspace.json"),
            }),
          })
        }).pipe(
          Effect.catchCause((cause) =>
            Effect.sync(() => log.warn("session export bootstrap failed", { err: Cause.squash(cause) })),
          ),
        )
        yield* EffectBridge.fromPromise(() => import("@/koda/indexing").then((mod) => mod.kodaIndexing.init())).pipe(
          Effect.catchCause((cause) =>
            Effect.sync(() => log.warn("indexing bootstrap failed", { err: Cause.squash(cause) })),
          ),
          Effect.forkDetach,
        )
      })

      return Service.of({ init })
    }),
  )

  export const defaultLayer = layer.pipe(
    Layer.provide([
      kodaSessions.defaultLayer,
      Session.defaultLayer,
      AppNodeBuilder.build(SessionSummary.node),
      AppNodeBuilder.build(Provider.node),
      MemoryService.layer,
      Bus.defaultLayer,
      kodaWatcher.defaultLayer,
      LifecycleHooks.defaultLayer,
      AppNodeBuilder.build(CollaborationCoordinator.node),
    ]),
  )

  const memory = LayerNode.make({ service: MemoryService.Service, layer: MemoryService.layer, deps: [] })
  const watcher = LayerNode.make({ service: kodaWatcher.Service, layer: kodaWatcher.defaultLayer, deps: [] })
  export const node = LayerNode.suspend(() =>
    LayerNode.make({
      service: Service,
      layer,
      deps: [
        kodaSessions.node,
        Session.node,
        SessionSummary.node,
        Provider.node,
        memory,
        Bus.node,
        watcher,
        LifecycleHooksNode,
        CollaborationCoordinator.node,
      ],
    }),
  )
}
