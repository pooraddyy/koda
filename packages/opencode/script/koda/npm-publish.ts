export namespace NpmPublish {
  const attempts = 3
  const base = 10_000
  const jitter = 5_000

  export async function retry(input: {
    name: string
    version: string
    run: () => Promise<unknown>
    exists: () => Promise<boolean>
    sleep?: (ms: number) => Promise<void>
  }) {
    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        await input.run()
        return
      } catch (err) {
        if (await input.exists()) {
          console.log(`published ${input.name}@${input.version} despite a failed npm publish command`)
          return
        }
        if (attempt === attempts || isPermanentPublishError(err)) throw err

        const delay = attempt * base + Math.floor(Math.random() * jitter)
        console.warn(
          `npm publish ${input.name}@${input.version} failed (attempt ${attempt}/${attempts}), retrying in ${delay / 1000}s`,
        )
        await (input.sleep ?? Bun.sleep)(delay)
      }
    }
  }
}

function isPermanentPublishError(error: unknown) {
  const record = error && typeof error === "object" ? (error as Record<string, unknown>) : undefined
  const stderr = record?.stderr
  const output =
    stderr instanceof Uint8Array ? new TextDecoder().decode(stderr) : typeof stderr === "string" ? stderr : ""
  const message = `${String(error)}\n${output}`
  return /E413|Payload Too Large|E403|Forbidden|EPUBLISHCONFLICT|cannot publish over the previously published version/i.test(
    message,
  )
}
