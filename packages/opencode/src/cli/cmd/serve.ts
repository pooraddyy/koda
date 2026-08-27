import { Effect } from "effect"
import { effectCmd } from "../effect-cmd"
import { withNetworkOptions, resolveNetworkOptions } from "../network"
import { Flag } from "@opencode-ai/core/flag/flag"

export const ServeCommand = effectCmd({
  command: "serve",
  builder: (yargs) => withNetworkOptions(yargs),
  describe: "starts a headless koda server",
  // Server loads instances per-request via x-koda-directory header — no
  // need for an ambient project InstanceContext at startup.
  instance: false, // koda_change
  handler: Effect.fn("Cli.serve")(function* (args) {
    const { Server } = yield* Effect.promise(() => import("../../server/server"))
    if (!Flag.koda_SERVER_PASSWORD) {
      console.log("Warning: koda_SERVER_PASSWORD is not set; server is unsecured.")
    }
    const opts = yield* resolveNetworkOptions(args)
    const server = yield* Effect.promise(() => Server.listen(opts))

    // koda_change start
    const urls = server.urls

    console.log(`koda server listening on ${urls.bind}`)
    if (urls.local !== urls.bind) console.log(`  Local:   ${urls.local}`)
    if (urls.network) console.log(`  Network: ${urls.network}`)
    // koda_change end

    // koda_change start - graceful signal shutdown
    // yield* Effect.never
    const { InstanceRuntime } = yield* Effect.promise(() => import("../../project/instance-runtime"))
    const { startParentWatchdog } = yield* Effect.promise(() => import("../../koda/parent-watchdog"))
    const { kodaSessions } = yield* Effect.promise(() => import("@/koda-sessions/koda-sessions"))
    yield* Effect.promise(
      () =>
        new Promise<void>((resolve) => {
          // Exit if the editor client that spawned us is hard-killed (no signal reaches us).
          const stopWatchdog = startParentWatchdog(() => process.kill(process.pid, "SIGTERM"))
          const shutdown = async () => {
            stopWatchdog()
            try {
              await kodaSessions.drainIngestForShutdown() // koda_change
              await InstanceRuntime.disposeAllInstances()
              await server.stop(true)
            } finally {
              resolve()
            }
          }
          process.once("SIGTERM", shutdown)
          process.once("SIGINT", shutdown)
          process.once("SIGHUP", shutdown)
        }),
    )
    // koda_change end
  }),
})
