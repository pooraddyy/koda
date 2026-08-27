import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"

export namespace kodaSandboxWorker {
  export const filename = "koda-sandbox-mutation-worker.js"

  export async function bundle() {
    const result = await Bun.build({
      entrypoints: ["../koda-sandbox/src/koda-sandbox-mutation-worker.ts"],
      target: "bun",
      format: "esm",
      minify: true,
    })
    if (!result.success || result.outputs.length !== 1) throw new Error("Could not bundle koda sandbox mutation worker")
    return result.outputs[0]
  }

  export async function copy(worker: Blob, dir: string) {
    const target = path.join(dir, filename)
    await Bun.write(target, worker)
    console.log(`copied koda sandbox mutation worker to ${target}`)
  }

  export async function smoke(binary: string) {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "koda-sandbox-worker-"))
    const target = path.join(root, "value.txt")
    const worker = path.join(path.dirname(binary), filename)
    try {
      const proc = Bun.spawn([binary, worker], {
        env: { ...process.env, BUN_BE_BUN: "1" },
        stdin: "pipe",
        stdout: "pipe",
        stderr: "pipe",
        windowsHide: true,
      })
      await proc.stdin.write(
        JSON.stringify({
          op: "batch",
          operations: [
            { op: "makeDirectory", path: root, options: { recursive: true } },
            { op: "writeFileString", path: target, data: "worker" },
          ],
        }),
      )
      await proc.stdin.end()
      const [stdout, stderr, code] = await Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
        proc.exited,
      ])
      if (code !== 0) throw new Error(stderr || `koda sandbox mutation worker exited ${code}`)
      const response: unknown = JSON.parse(stdout)
      if (
        typeof response !== "object" ||
        response === null ||
        !("ok" in response) ||
        response.ok !== true ||
        (await Bun.file(target).text()) !== "worker"
      ) {
        throw new Error("Packaged koda sandbox mutation worker did not write the expected content")
      }
    } finally {
      await fs
        .rm(root, { recursive: true, force: true })
        .catch((err) => console.warn(`Failed to remove koda sandbox worker smoke test directory ${root}`, err))
    }
  }
}
