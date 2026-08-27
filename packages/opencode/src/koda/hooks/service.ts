import { Context, Effect, Layer, Schema } from "effect"
import { ChildProcess } from "effect/unstable/process"
import { NodeServices } from "@effect/platform-node"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { Config } from "@/config/config"
import { HookEngine, spawnHookProcess, type HookExecutor } from "./engine"
import { InstanceRef } from "@/effect/instance-ref"
import { SessionID } from "@/session/schema"
import { peek, profile } from "@/koda/sandbox/policy"
import { run as runSandbox, prepareCommand } from "@koda/sandbox"
import type { HookPayload, HookRunResult } from "./types"

export interface Interface {
  readonly list: () => Effect.Effect<ReturnType<HookEngine["list"]>>
  readonly run: (payload: HookPayload) => Effect.Effect<HookRunResult>
}

export class Service extends Context.Service<Service, Interface>()("@koda/LifecycleHooks") {}

function definitions(config: Config.Info) {
  if (config.hooks?.enabled !== true) return []
  return (config.hooks.definitions ?? []).map((hook) => ({
    ...hook,
    // Trust is provenance, never a user-controlled config field. Config-defined hooks may
    // observe and warn, but cannot block tool/session execution or elevate privileges.
    onError: hook.on_error === "block" ? "warn" : hook.on_error,
    trusted: false,
  }))
}

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const config = yield* Config.Service
    const instance = yield* InstanceRef

    const execute: HookExecutor = async (input) => {
      if (!instance || !input.payload.sessionID) {
        throw new Error("Lifecycle hook skipped: no session sandbox is available")
      }
      const sessionID = SessionID.make(input.payload.sessionID)
      const snapshot = await Effect.runPromise(
        peek(instance.directory, sessionID).pipe(Effect.catchAll(() => Effect.succeed(undefined))),
      )
      if (!snapshot?.enabled) {
        throw new Error("Lifecycle hook skipped: enable Koda sandbox for the owning session")
      }
      return await Effect.runPromise(
        runSandbox(
          profile(instance, snapshot.mode, snapshot.writablePaths, snapshot.allowedHosts),
          Effect.gen(function* () {
            const prepared = yield* prepareCommand(
              ChildProcess.make(input.command[0] ?? "/bin/sh", input.command.slice(1), {
                cwd: input.cwd,
                env: input.env,
                extendEnv: false,
                shell: false,
                stdin: "ignore",
                stdout: "pipe",
                stderr: "pipe",
              }),
              input.cwd,
              input.env,
            )
            return yield* Effect.tryPromise({
              try: () =>
                spawnHookProcess(input, [prepared.command, ...prepared.args], {
                  cwd: prepared.options.cwd,
                  env: Object.fromEntries(
                    Object.entries(prepared.options.env ?? {}).filter(
                      (entry): entry is [string, string] => entry[1] !== undefined,
                    ),
                  ),
                }),
              catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
            })
          }),
        ).pipe(Effect.provide(NodeServices.layer)),
      )
    }

    const load = Effect.fn("LifecycleHooks.load")(function* () {
      const current = yield* config.get()
      const configured = definitions(current)
      return yield* Effect.try({
        try: () => new HookEngine(configured, execute),
        catch: (cause) => new Error(cause instanceof Error ? cause.message : String(cause)),
      }).pipe(Effect.orElseSucceed(() => new HookEngine([])))
    })

    const list = Effect.fn("LifecycleHooks.list")(function* () {
      return yield* load().pipe(Effect.map((engine) => engine.list()))
    })

    const run = Effect.fn("LifecycleHooks.run")(function* (payload: HookPayload) {
      const engine = yield* load()
      return yield* Effect.promise(() => engine.run(payload))
    })

    return Service.of({ list, run })
  }),
)

export const defaultLayer = layer
export const node = LayerNode.make({ service: Service, layer, deps: [Config.node] })

export const HookEventSchema = Schema.Literals([
  "session.start",
  "session.end",
  "turn.start",
  "turn.complete",
  "turn.error",
  "turn.interrupted",
  "prompt.submit",
  "tool.before",
  "tool.after",
  "subagent.start",
  "subagent.complete",
  "subagent.error",
  "graph.node",
  "graph.complete",
])
