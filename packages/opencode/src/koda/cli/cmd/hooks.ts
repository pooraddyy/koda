import { cmd } from "@/cli/cmd/cmd"

async function listHooks() {
  const { AppRuntime } = await import("@/effect/app-runtime")
  const { InstanceStore } = await import("@/project/instance-store")
  const { Service } = await import("@/koda/hooks/service")
  const directory = process.cwd()
  try {
    return await AppRuntime.runPromise(
      InstanceStore.Service.use((store) =>
        store.provide(
          { directory },
          Service.use((service) => service.list()),
        ),
      ),
    )
  } finally {
    await AppRuntime.runPromise(InstanceStore.Service.use((store) => store.disposeDirectory(directory)))
  }
}

export const HooksCommand = cmd({
  command: "hooks",
  describe: "inspect configured lifecycle hooks",
  builder: (yargs) =>
    yargs
      .command(
        cmd({
          command: "list",
          describe: "list sanitized lifecycle hook metadata",
          builder: (nested) => nested.option("json", { type: "boolean", describe: "print JSON" }),
          handler: async (args) => {
            const hooks = await listHooks()
            if (args.json) {
              console.log(JSON.stringify(hooks, null, 2))
              return
            }
            if (hooks.length === 0) {
              console.log("No lifecycle hooks configured.")
              return
            }
            for (const hook of hooks) {
              const event = Array.isArray(hook.event) ? hook.event.join(",") : hook.event
              console.log(
                `${hook.id}  ${hook.enabled ? "enabled" : "disabled"}  ${event}  mode=${hook.mode}  onError=${hook.onError}`,
              )
            }
          },
        }),
      )
      .demandCommand(),
  handler: async () => {},
})
