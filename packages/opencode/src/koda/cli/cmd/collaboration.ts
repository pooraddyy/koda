import type { Argv } from "yargs"
import { cmd } from "@/cli/cmd/cmd"

async function runService<A>(build: (Effect: any) => any): Promise<A> {
  const { AppRuntime } = await import("@/effect/app-runtime")
  const { InstanceStore } = await import("@/project/instance-store")
  const { Effect } = await import("effect")
  const directory = process.cwd()
  try {
    return await AppRuntime.runPromise(
      InstanceStore.Service.use((store) => store.provide({ directory }, build(Effect))),
    )
  } finally {
    await AppRuntime.runPromise(InstanceStore.Service.use((store) => store.disposeDirectory(directory)))
  }
}

function print(items: readonly unknown[], json: boolean) {
  if (json) {
    console.log(JSON.stringify(items, null, 2))
    return
  }
  if (items.length === 0) {
    console.log("No collaboration graphs found.")
    return
  }
  for (const item of items) {
    const graph = item as {
      id: string
      mode: string
      state: string
      total: number
      revision: number
      nodes?: ReadonlyArray<{
        id: string
        state: string
        attempts: number
        progress?: string
        lastHeartbeatAt?: number
      }>
    }
    console.log(`${graph.id}  ${graph.state}  mode=${graph.mode}  nodes=${graph.total}  revision=${graph.revision}`)
    for (const node of graph.nodes ?? []) {
      const heartbeat = node.lastHeartbeatAt ? ` heartbeat=${new Date(node.lastHeartbeatAt).toISOString()}` : ""
      const progress = node.progress ? ` progress=${node.progress}` : ""
      console.log(`  ${node.id}  ${node.state}  attempts=${node.attempts}${heartbeat}${progress}`)
    }
  }
}

const ListCommand = cmd({
  command: "list",
  describe: "list durable collaboration graphs",
  builder: (yargs) => yargs.option("json", { type: "boolean", describe: "print JSON" }),
  handler: async (args) => {
    const { CollaborationCoordinator } = await import("@/koda/orchestration/service")
    const { graphSummary } = await import("@/koda/orchestration/graph")
    const result = await runService((Effect) =>
      CollaborationCoordinator.Service.use((service: any) =>
        service.list().pipe(Effect.map((graphs: any[]) => graphs.map(graphSummary))),
      ),
    )
    print(result, Boolean(args.json))
  },
})

const StatusCommand = cmd({
  command: "status <graphID>",
  describe: "show one collaboration graph",
  builder: (yargs) =>
    yargs
      .positional("graphID", { type: "string", demandOption: true })
      .option("json", { type: "boolean", describe: "print JSON" }),
  handler: async (args) => {
    const { CollaborationCoordinator } = await import("@/koda/orchestration/service")
    const result = await runService((Effect) =>
      CollaborationCoordinator.Service.use((service: any) =>
        service
          .summary(String(args.graphID))
          .pipe(Effect.map((value: any) => (value._tag === "Some" ? value.value : undefined))),
      ),
    )
    if (!result) throw new Error(`Collaboration graph ${args.graphID} was not found`)
    print([result], Boolean(args.json))
  },
})

const RecoverCommand = cmd({
  command: "recover",
  describe: "recover interrupted collaboration graphs",
  builder: (yargs) => yargs.option("json", { type: "boolean", describe: "print JSON" }),
  handler: async (args) => {
    const { CollaborationCoordinator } = await import("@/koda/orchestration/service")
    const { graphSummary } = await import("@/koda/orchestration/graph")
    const result = await runService((_) => CollaborationCoordinator.Service.use((service: any) => service.recover()))
    print(result.map(graphSummary), Boolean(args.json))
  },
})

const CancelCommand = cmd({
  command: "cancel <graphID>",
  describe: "cancel a collaboration graph",
  builder: (yargs) => yargs.positional("graphID", { type: "string", demandOption: true }),
  handler: async (args) => {
    const { CollaborationCoordinator } = await import("@/koda/orchestration/service")
    const { SessionRunState } = await import("@/session/run-state")
    const { SessionID } = await import("@/session/schema")
    const result = await runService((Effect) =>
      CollaborationCoordinator.Service.use((service: any) =>
        service.cancel(String(args.graphID)).pipe(
          Effect.flatMap((value: any) => {
            if (value._tag === "None") return Effect.succeed(false)
            return Effect.gen(function* () {
              const runState = yield* SessionRunState.Service
              for (const node of value.value.nodes.values()) {
                if (node.sessionID) yield* runState.cancel(SessionID.make(node.sessionID)).pipe(Effect.ignore)
              }
              return true
            })
          }),
        ),
      ),
    )
    if (!result) throw new Error(`Collaboration graph ${args.graphID} was not found`)
    console.log(`Cancelled collaboration graph ${args.graphID}.`)
  },
})

export const CollaborationCommand = cmd({
  command: "collaboration",
  describe: "inspect and control durable Koda collaboration graphs",
  builder: (yargs: Argv) =>
    yargs.command(ListCommand).command(StatusCommand).command(RecoverCommand).command(CancelCommand).demandCommand(),
  handler: async () => {},
})
