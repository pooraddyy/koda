import { cmd } from "@/cli/cmd/cmd"
import { EvolutionStore } from "@/koda/evolution/store"
import { MemoryPaths } from "@koda/koda-memory/effect/paths"

function root() {
  const directory = process.cwd()
  return MemoryPaths.root({ ctx: { directory, worktree: directory } })
}

const StatusCommand = cmd({
  command: "status",
  describe: "show self-evolution lesson status",
  builder: (yargs) => yargs.option("json", { type: "boolean", describe: "print JSON" }),
  handler: async (args) => {
    const lessons = await EvolutionStore.list(root())
    if (args.json) {
      console.log(
        JSON.stringify({ count: lessons.length, location: EvolutionStore.location(root()), lessons }, null, 2),
      )
      return
    }
    console.log(`${lessons.length} project lesson${lessons.length === 1 ? "" : "s"} retained.`)
    console.log(`Location: ${EvolutionStore.location(root())}`)
  },
})

const RecallCommand = cmd({
  command: "recall <query>",
  describe: "search self-evolution lessons for this project",
  builder: (yargs) =>
    yargs
      .positional("query", { type: "string", demandOption: true })
      .option("json", { type: "boolean", describe: "print JSON" }),
  handler: async (args) => {
    const lessons = await EvolutionStore.search(root(), String(args.query))
    if (args.json) {
      console.log(JSON.stringify(lessons, null, 2))
      return
    }
    if (lessons.length === 0) {
      console.log("No matching project lessons found.")
      return
    }
    for (const lesson of lessons) console.log(`- ${lesson.lesson}`)
  },
})

export const EvolutionCommand = cmd({
  command: "evolution",
  describe: "inspect self-evolution lessons for the current project",
  builder: (yargs: Argv) => yargs.command(StatusCommand).command(RecallCommand).demandCommand(),
  handler: async () => {},
})
